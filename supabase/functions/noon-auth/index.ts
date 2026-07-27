import { createClient } from "npm:@supabase/supabase-js@2.110.8"
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

// Per the Noon Partner API spec, ALL requests must include a User-Agent header
// identifying the application. Requests without it may be rejected.
const USER_AGENT = "NexCommerce/1.0.0"

const NOON_LOGIN_URL =
  "https://noon-api-gateway.noon.partners/identity/public/v1/api/login"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

type CachedCookie = {
  cookie: string
  expires_at: string | null
  updated_at: string
}

type ServiceAccountKey = {
  key_id: string
  private_key: string
  channel_identifier: string
  project_code: string
}

/**
 * Resolve Noon service account credentials. The spec describes a downloaded
 * `.json` key file; we support that via the `NOON_SERVICE_ACCOUNT_KEY` env var
 * (the full JSON content). For backward compatibility we also fall back to the
 * individual env vars that were previously configured.
 */
function loadServiceAccount(): ServiceAccountKey {
  const jsonKey = Deno.env.get("NOON_SERVICE_ACCOUNT_KEY")
  if (jsonKey) {
    try {
      const parsed = JSON.parse(jsonKey) as Partial<ServiceAccountKey>
      if (parsed.key_id && parsed.private_key && parsed.channel_identifier && parsed.project_code) {
        return parsed as ServiceAccountKey
      }
    } catch {
      // fall through to individual env vars
    }
  }

  const keyId = Deno.env.get("NOON_KEY_ID")
  const privateKey = Deno.env.get("NOON_PRIVATE_KEY")
  const channelIdentifier = Deno.env.get("NOON_CHANNEL_IDENTIFIER")
  const projectCode = Deno.env.get("NOON_PROJECT_CODE")

  if (!keyId || !privateKey || !channelIdentifier || !projectCode) {
    throw new Error(
      "Noon service account credentials are not configured. Set either " +
      "NOON_SERVICE_ACCOUNT_KEY (the JSON key file content) or all of " +
      "NOON_KEY_ID, NOON_PRIVATE_KEY, NOON_CHANNEL_IDENTIFIER, and NOON_PROJECT_CODE."
    )
  }

  return {
    key_id: keyId,
    private_key: privateKey,
    channel_identifier: channelIdentifier,
    project_code: projectCode,
  }
}

/**
 * Noon's private key is stored as a PEM string in an env var or JSON key. When
 * loaded from a `.env` file, literal `\n` sequences are often preserved as two
 * characters rather than real newlines, which breaks PEM parsing. This helper
 * converts any escaped `\n` into actual newlines and trims surrounding
 * whitespace so the key imports cleanly into WebCrypto via jose.
 */
function normalizePrivateKey(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim()
}

/**
 * Build and sign the RS256 JWT Noon expects, following the official spec:
 * Header: { alg: "RS256", typ: "JWT" }
 * Payload: { sub: <key_id>, iat: <now>, jti: <random uuid> }
 */
async function generateNoonJwt(account: ServiceAccountKey): Promise<string> {
  const privateKeyPem = normalizePrivateKey(account.private_key)
  const privateKey = await importPKCS8(privateKeyPem, "RS256")

  const now = Math.floor(Date.now() / 1000)
  const jti = crypto.randomUUID()

  return await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setSubject(account.key_id)
    .setIssuedAt(now)
    .setJti(jti)
    .sign(privateKey)
}

/**
 * POST the signed JWT to Noon's login endpoint and return the session cookie
 * extracted from the `Set-Cookie` response header(s). Includes the mandatory
 * User-Agent header per the Noon API specification.
 */
async function loginToNoon(jwt: string, account: ServiceAccountKey): Promise<{
  cookie: string
  expiresAt: Date | null
}> {
  const response = await fetch(NOON_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      token: jwt,
      default_project_code: account.project_code,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(
      `Noon login failed (${response.status}): ${text || response.statusText}`
    )
  }

  // Extract auth cookies from the login response. Prefer the structured
  // getSetCookie() API when available (returns an array of Set-Cookie values),
  // falling back to manually collecting the headers.
  const setCookieHeaders: string[] =
    response.headers.getSetCookie?.() ??
    (response.headers.get("set-cookie") ? [response.headers.get("set-cookie") as string] : [])

  if (setCookieHeaders.length === 0) {
    throw new Error("Noon login succeeded but no Set-Cookie header was returned")
  }

  // Build the outbound Cookie header value: take the cookie pairs (everything
  // up to the first `;` in each Set-Cookie value) and join with "; ".
  const cookiePairs = setCookieHeaders.map((sc) => sc.split(";")[0].trim())
  const cookie = cookiePairs.filter(Boolean).join("; ")

  if (!cookie) {
    throw new Error("Noon login returned an empty Set-Cookie header")
  }

  // Parse the Expires attribute (if present) from any of the Set-Cookie values
  // so we can decide later whether the cached cookie is still fresh.
  let expiresAt: Date | null = null
  for (const sc of setCookieHeaders) {
    const match = sc.match(/expires=([^;]+)/i)
    if (match) {
      const parsed = new Date(match[1].trim())
      if (!isNaN(parsed.getTime())) {
        expiresAt = parsed
        break
      }
    }
  }

  return { cookie, expiresAt }
}

/**
 * Persist the session cookie to the cache table (single-row upsert).
 */
async function cacheCookie(cookie: string, expiresAt: Date | null): Promise<void> {
  const { error } = await supabase
    .from("noon_session_cookies")
    .upsert(
      {
        id: 1,
        cookie,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )

  if (error) {
    throw new Error(`Failed to cache Noon session cookie: ${error.message}`)
  }
}

/**
 * Read the cached cookie row, if any.
 */
async function getCachedCookie(): Promise<CachedCookie | null> {
  const { data, error } = await supabase
    .from("noon_session_cookies")
    .select("cookie, expires_at, updated_at")
    .eq("id", 1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read cached Noon session cookie: ${error.message}`)
  }

  return data as CachedCookie | null
}

/**
 * Decide whether a cached cookie is still usable. We treat it as fresh when:
 *  - it has no `expires_at` (unknown expiry) AND was updated < 50 minutes ago,
 *    or
 *  - it has an `expires_at` that is still in the future (with a 1-minute margin).
 */
function isCookieFresh(cached: CachedCookie): boolean {
  const now = Date.now()
  if (cached.expires_at) {
    const expires = new Date(cached.expires_at).getTime()
    return expires - now > 60 * 1000 // 1-minute safety margin
  }
  const updated = new Date(cached.updated_at).getTime()
  return now - updated < 50 * 60 * 1000 // 50 minutes
}

/**
 * Authenticate to Noon (generating a fresh JWT from the service account key and
 * performing the login) and cache the resulting session cookie.
 */
async function authenticate(): Promise<string> {
  const account = loadServiceAccount()
  const jwt = await generateNoonJwt(account)
  const { cookie, expiresAt } = await loginToNoon(jwt, account)
  await cacheCookie(cookie, expiresAt)
  return cookie
}

/**
 * Return a valid Noon session cookie, re-authenticating only when the cached
 * cookie is missing, expired, or (when `force=true`) explicitly invalidated.
 */
async function getValidCookie(force = false): Promise<string> {
  if (!force) {
    const cached = await getCachedCookie()
    if (cached && isCookieFresh(cached)) {
      return cached.cookie
    }
  }
  return await authenticate()
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    let force = false
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}))
      force = Boolean(body?.force)
    }

    const cookie = await getValidCookie(force)

    return new Response(
      JSON.stringify({ ok: true, cookie }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
