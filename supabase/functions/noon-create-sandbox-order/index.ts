const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_SANDBOX_ORDER_URL =
  "https://noon-api-gateway.noon.partners/fbpi/v1/sandbox-order/create"

const WAREHOUSE_CODE_REGEX = /^[A-Za-z0-9_-]{5,}$/
const INVALID_WAREHOUSE_CODE_MESSAGE =
  "Invalid Warehouse Code. Please enter a valid Noon warehouse code (e.g., W00012345A)."

const USER_AGENT = "NexCommerce/1.0.0"

// Random idempotency key, unique and max 10 characters.
function randomIdempotencyKey(): string {
  return Math.random().toString(36).substring(2, 10)
}

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
  "ok",
  "success",
  "successful",
  "succeeded",
  "completed",
  "200",
  "true",
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

async function callNoonSandbox(
  cookie: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; statusText: string; text: string; body: unknown }> {
  const response = await fetch(NOON_SANDBOX_ORDER_URL, {
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
  let result = await callNoonSandbox(cookie, payload)

  if (result.status === 401) {
    const freshCookie = await getSessionCookie(true)
    result = await callNoonSandbox(freshCookie, payload)
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
    const DEFAULT_WAREHOUSE_CODE = "W00210108EG"

    const parsed = (await req.json().catch(() => ({}))) as {
      warehouse_code?: string
    }

    const trimmedWarehouseCode =
      typeof parsed.warehouse_code === "string" && parsed.warehouse_code.trim() !== ""
        ? parsed.warehouse_code.trim()
        : DEFAULT_WAREHOUSE_CODE

    if (!WAREHOUSE_CODE_REGEX.test(trimmedWarehouseCode)) {
      return new Response(
        JSON.stringify({ ok: false, error: INVALID_WAREHOUSE_CODE_MESSAGE }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const payload = {
      warehouse_code: trimmedWarehouseCode,
      idempotency_key: randomIdempotencyKey(),
      country_code: "eg",
      items: [
        {
          status: "MP_ITEM_STATUS_CONFIRMED",
          partner_sku: "TEST-SKU-01",
        },
        {
          status: "MP_ITEM_STATUS_CONFIRMED",
          partner_sku: "TEST-SKU-02",
        },
      ],
    }

    const responseBody = await callNoonWithRetry(payload) as { fbpi_order_nr?: string }

    return new Response(
      JSON.stringify({
        ok: true,
        fbpi_order_nr: responseBody?.fbpi_order_nr,
        raw: responseBody,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create sandbox order"
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
