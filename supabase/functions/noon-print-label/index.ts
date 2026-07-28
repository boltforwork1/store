const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_PRINT_LABEL_URL =
  "https://noon-api-gateway.noon.partners/shipment/v1/shipping-label/print"

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

async function callNoonPrintLabel(
  cookie: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; statusText: string; text: string; body: unknown }> {
  const response = await fetch(NOON_PRINT_LABEL_URL, {
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

async function callNoonWithRetry(
  payload: Record<string, unknown>
): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  let result = await callNoonPrintLabel(cookie, payload)

  if (result.status === 401) {
    const freshCookie = await getSessionCookie(true)
    result = await callNoonPrintLabel(freshCookie, payload)
  }

  if (!result.ok) {
    throw new Error(
      `Noon API Error [${result.status} ${result.statusText}]: ${result.text || "Empty Body"}`
    )
  }

  const bodyError = extractNoonError(result.body)
  if (bodyError) {
    throw new Error(bodyError)
  }

  return result.body
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as {
      order_id?: string
      awb_nr?: string
    }

    const orderId =
      typeof parsed.order_id === "string" ? parsed.order_id.trim() : ""
    const awbNr =
      typeof parsed.awb_nr === "string" ? parsed.awb_nr.trim() : ""

    if (!orderId && !awbNr) {
      return new Response(
        JSON.stringify({ ok: false, error: "Either `order_id` or `awb_nr` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Noon's shipping-label/print endpoint accepts an AWB number. We prefer
    // the explicitly-provided awb_nr; if only an order_id is given we pass it
    // through and let Noon resolve it.
    const payload: Record<string, unknown> = {}
    if (awbNr) {
      payload.awb_nr = awbNr
    } else {
      payload.fbpi_order_nr = orderId
    }

    const responseBody = await callNoonWithRetry(payload)

    // Noon may return a label URL or base64 PDF in the response body. Surface
    // the raw body so the frontend can extract the label data.
    const body = responseBody as Record<string, unknown> | null
    const labelUrl =
      body && typeof body === "object"
        ? (body.label_url ?? body.url ?? body.pdf_url ?? (body.data as Record<string, unknown>)?.label_url)
        : null

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          label_url: typeof labelUrl === "string" ? labelUrl : null,
          raw: responseBody,
        },
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
