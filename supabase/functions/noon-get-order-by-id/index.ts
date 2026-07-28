import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_BASE = "https://noon-api-gateway.noon.partners"

// Per the Noon Partner API spec, ALL requests must include a User-Agent header
// identifying the application. Requests without it may be rejected.
const USER_AGENT = "NexCommerce/1.0.0"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

type NoonOrderItem = {
  delivered_invoice_price?: number | string | null
  [key: string]: unknown
}

type NoonOrder = {
  fbpi_order_nr?: string
  order_created_at?: string
  customer_country_code?: string
  items?: NoonOrderItem[]
  [key: string]: unknown
}

/**
 * Fetch a valid Noon session cookie from the noon-auth edge function. When
 * `force` is true the cached cookie is invalidated and a fresh login is
 * performed — used to recover from a 401 during an order fetch.
 */
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

async function callNoonGetOrder(
  url: string,
  cookie: string
): Promise<{ ok: boolean; status: number; statusText: string; text: string; body: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
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

async function callNoonWithRetry(url: string): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  let result = await callNoonGetOrder(url, cookie)

  if (result.status === 401) {
    const freshCookie = await getSessionCookie(true)
    result = await callNoonGetOrder(url, freshCookie)
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

function coerceNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0
  const n = Number(value)
  return isNaN(n) ? 0 : n
}

function calculateOrderTotal(order: NoonOrder): number {
  if (!Array.isArray(order.items) || order.items.length === 0) return 0
  return order.items.reduce(
    (sum, item) => sum + coerceNumber(item.delivered_invoice_price),
    0
  )
}

type NormalizedOrder = {
  noon_order_id: string
  order_date: string | null
  total_price: number
  customer_country_code: string | null
  status: string
  raw_payload: NoonOrder
}

/**
 * The GetFbpiOrder endpoint may return the order object either at the top level
 * or nested under `data`/`order`/`result`. Try each shape and pick the first
 * that carries a `fbpi_order_nr`.
 */
function findOrderObject(body: unknown): NoonOrder | null {
  if (!body || typeof body !== "object") return null

  const candidates: NoonOrder[] = []
  const obj = body as Record<string, unknown>

  candidates.push(obj as NoonOrder)
  for (const key of ["data", "order", "result", "fbpi_order"]) {
    const nested = obj[key]
    if (nested && typeof nested === "object") {
      candidates.push(nested as NoonOrder)
    }
  }

  return candidates.find((c) => typeof c.fbpi_order_nr === "string") ?? null
}

function normalizeOrder(order: NoonOrder): NormalizedOrder | null {
  const orderId = order.fbpi_order_nr
  if (!orderId || typeof orderId !== "string") return null

  return {
    noon_order_id: orderId,
    order_date: order.order_created_at ?? null,
    total_price: calculateOrderTotal(order),
    customer_country_code: order.customer_country_code ?? null,
    status: "Fetched",
    raw_payload: order,
  }
}

async function persistOrder(order: NormalizedOrder): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .upsert(
      {
        noon_order_id: order.noon_order_id,
        order_date: order.order_date,
        total_price: order.total_price,
        customer_country_code: order.customer_country_code,
        status: order.status,
        raw_payload: order.raw_payload,
      },
      { onConflict: "noon_order_id" }
    )

  if (error) {
    throw new Error(`Failed to persist order: ${error.message}`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as {
      fbpi_order_nr?: string
    }

    if (!parsed.fbpi_order_nr || typeof parsed.fbpi_order_nr !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "`fbpi_order_nr` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const orderId = parsed.fbpi_order_nr.trim()
    if (!orderId) {
      return new Response(
        JSON.stringify({ ok: false, error: "`fbpi_order_nr` must not be empty." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const url = `${NOON_BASE}/fbpi/v1/fbpi-order/${encodeURIComponent(orderId)}/get`
    const responseBody = await callNoonWithRetry(url)

    const orderObj = findOrderObject(responseBody)
    if (!orderObj) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Noon returned a response but no order object was found.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const normalized = normalizeOrder(orderObj)
    if (!normalized) {
      return new Response(
        JSON.stringify({ ok: false, error: "Order is missing `fbpi_order_nr`." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    await persistOrder(normalized)

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          order: {
            noon_order_id: normalized.noon_order_id,
            order_date: normalized.order_date,
            total_price: normalized.total_price,
            customer_country_code: normalized.customer_country_code,
            status: normalized.status,
          },
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
