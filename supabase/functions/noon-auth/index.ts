import { createClient } from "npm:@supabase/supabase-js@2.110.8"
import { SignJWT } from "npm:jose@5.9.6"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

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

/**
 * Read a required string env var. Throws a clear error if missing so the
 * caller (and the dashboard operator) sees exactly which credential is unset.
 */
function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Noon's private key is stored as a PEM string in an env var. When loaded from
 * a `.env` file, literal `\n` sequences are often preserved as two characters
 * rather than real newlines, which breaks PEM parsing. This helper converts
 * any escaped `\n` into actual newlines and trims surrounding whitespace so
 * the key imports cleanly into WebCrypto via jose.
 */
function normalizePrivateKey(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim()
}

/**
 * Build and sign the RS256 JWT Noon expects.
 * Header: { alg: "RS256", kid: NOON_KEY_ID }
 * Payload: iss = sub = NOON_CHANNEL_IDENTIFIER, short exp (5 minutes).
 */
async function generateNoonJwt(): Promise<string> {
  const keyId = requireEnv("NOON_KEY_ID")
  const privateKeyPem = normalizePrivateKey(requireEnv("NOON_PRIVATE_KEY"))
  const channelIdentifier = requireEnv("NOON_CHANNEL_IDENTIFIER")

  const privateKey = await importPKCS8(privateKeyPem)

  const now = Math.floor(Date.now() / 1000)
  const exp = now + 5 * 60 // 5 minutes — short-lived, as required

  return await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(channelIdentifier)
    .setSubject(channelIdentifier)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey)
}

/**
 * Import a PEM-encoded PKCS#8 RSA private key into a WebCrypto CryptoKey.
 * jose's `importPKCS8` handles the PEM-to-DER decoding and key construction.
 */
async function importPKCS8(pem: string): Promise<CryptoKey> {
  const { importPKCS8 } = await import("npm:jose@5.9.6")
  return await importPKCS8(pem, "RS256")
}

/**
 * POST the signed JWT to Noon's login endpoint and return the session cookie
 * extracted from the `Set-Cookie` response header(s).
 */
async function loginToNoon(jwt: string): Promise<{
  cookie: string
  expiresAt: Date | null
}> {
  const projectCode = requireEnv("NOON_PROJECT_CODE")

  const response = await fetch(NOON_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: jwt,
      default_project_code: projectCode,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(
      `Noon login failed (${response.status}): ${text || response.statusText}`
    )
  }

  // The `Set-Cookie` header may appear multiple times. The Headers getter joins
  // them with ", " which is not a valid cookie separator, so we read the raw
  // headers from the response and join with "; " — the separator the Cookie
  // request header expects when sending multiple cookies back.
  const setCookieHeaders: string[] = []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      setCookieHeaders.push(value)
    }
  })

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
 * Authenticate to Noon (generating a fresh JWT and performing the login) and
 * cache the resulting session cookie. Returns the cookie string.
 */
async function authenticate(): Promise<string> {
  const jwt = await generateNoonJwt()
  const { cookie, expiresAt } = await loginToNoon(jwt)
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
