const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_GENERATE_AWBS_URL =
  "https://noon-api-gateway.noon.partners/fbpi/v1/shipment/noon-logistics-awbs/get"

// Per the Noon Partner API spec, ALL requests must include a User-Agent header
// identifying the application. Requests without it may be rejected.
const USER_AGENT = "NexCommerce/1.0.0"

async function getSessionCookie(force = false): Promise<string> {
  const authUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/noon-auth`
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ force }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Noon auth failed (${response.status}): ${text || response.statusText}`)
  }

  const data = (await response.json()) as { ok: boolean; cookie?: string; error?: string }
  if (!data.ok || !data.cookie) {
    throw new Error(`Noon auth failed: ${data.error ?? "no cookie returned"}`)
  }

  return data.cookie
}

const NOON_SUCCESS_STATUS_CODES = new Set([
  "ok", "success", "successful", "succeeded", "completed", "200", "true",
])

function extractNoonError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const obj = body as Record<string, unknown>

  const status = obj.status
  if (status && typeof status === "object") {
    const s = status as Record<string, unknown>
    const code =
      typeof s.status_code === "string" ? s.status_code :
      typeof s.code === "string" ? s.code : ""
    if (code && !NOON_SUCCESS_STATUS_CODES.has(code.toLowerCase())) {
      const msg =
        typeof s.message === "string" ? s.message :
        typeof s.description === "string" ? s.description :
        typeof s.detail === "string" ? s.detail : ""
      return msg ? `Noon API Error [${code}]: ${msg}` : `Noon API Error [${code}]`
    }
  }

  if (typeof status === "string" && !NOON_SUCCESS_STATUS_CODES.has(status.toLowerCase())) {
    return `Noon API Error: ${status}`
  }

  if (typeof obj.error === "string" && obj.error.trim() !== "") {
    return obj.error
  }

  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    const first = obj.errors[0]
    const msg =
      typeof first === "string" ? first :
      (first && typeof first === "object" && typeof (first as Record<string, unknown>).message === "string")
        ? String((first as Record<string, unknown>).message)
        : JSON.stringify(first)
    return `Noon API Error: ${msg}`
  }

  return null
}

async function callNoonGenerateAwbs(
  cookie: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; statusText: string; text: string; body: unknown }> {
  const response = await fetch(NOON_GENERATE_AWBS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(payload),
  })

  const textBody = await response.text()
  let body: unknown
  try {
    body = JSON.parse(textBody)
  } catch {
    body = textBody
  }

  return { ok: response.ok, status: response.status, statusText: response.statusText, text: textBody, body }
}

/**
 * Extract the generated AWB number from the Noon response. The response may
 * nest the AWB under `data`/`result`/`awbs`. Each AWB entry typically has an
 * `awb_nr` field. We return the first non-empty value we find.
 */
function extractAwbNr(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const obj = body as Record<string, unknown>

  // Direct top-level field.
  if (typeof obj.awb_nr === "string" && obj.awb_nr.trim() !== "") {
    return obj.awb_nr.trim()
  }

  // Search nested candidates.
  const candidates: Record<string, unknown>[] = [obj]
  for (const key of ["data", "result", "awbs", "awb"]) {
    const nested = obj[key]
    if (nested && typeof nested === "object") {
      candidates.push(nested as Record<string, unknown>)
    }
  }

  for (const candidate of candidates) {
    // Single AWB object.
    if (typeof candidate.awb_nr === "string" && candidate.awb_nr.trim() !== "") {
      return candidate.awb_nr.trim()
    }
    // Array of AWB objects.
    const awbsArray = candidate.awbs
    if (Array.isArray(awbsArray) && awbsArray.length > 0) {
      for (const entry of awbsArray) {
        if (entry && typeof entry === "object") {
          const nr = (entry as Record<string, unknown>).awb_nr
          if (typeof nr === "string" && nr.trim() !== "") {
            return nr.trim()
          }
        }
      }
    }
  }

  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as {
      country_code?: string
      qty?: number
    }

    const countryCode = (
      typeof parsed.country_code === "string" ? parsed.country_code.trim().toLowerCase() : ""
    ) || "eg"

    const qty = 1

    const payload = {
      country_code: countryCode,
      qty,
    }

    // 1. Call the Noon GenerateAwbs API.
    const cookie = await getSessionCookie(false)
    let result = await callNoonGenerateAwbs(cookie, payload)

    if (result.status === 401) {
      const freshCookie = await getSessionCookie(true)
      result = await callNoonGenerateAwbs(freshCookie, payload)
    }

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Noon API Error [${result.status} ${result.statusText}]: ${result.text || "Empty Body"}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const bodyError = extractNoonError(result.body)
    if (bodyError) {
      return new Response(
        JSON.stringify({ ok: false, error: bodyError }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    // 2. Extract the AWB number from the response.
    const awbNr = extractAwbNr(result.body)
    if (!awbNr) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Noon returned a success response but no AWB number was found.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: { awb_nr: awbNr },
      }),
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
