import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_BASE = "https://noon-api-gateway.noon.partners"
const NOON_ORDERS_LIST_URL = `${NOON_BASE}/fbpi/v1/fbpi-orders/list`

// Strict warehouse code format: alphanumeric, underscores, hyphens, min 5 chars.
// Noon does not validate this server-side, so we enforce it on both the client
// and edge function to prevent bogus codes from silently returning empty lists.
const WAREHOUSE_CODE_REGEX = /^[A-Za-z0-9_-]{5,}$/
const INVALID_WAREHOUSE_CODE_MESSAGE =
  "Invalid Warehouse Code. Please enter a valid Noon warehouse code (e.g., W00012345A)."

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

type NoonListResponse = {
  orders?: NoonOrder[]
  [key: string]: unknown
}

/**
 * Fetch a valid Noon session cookie from the noon-auth edge function. When
 * `force` is true the cached cookie is invalidated and a fresh login is
 * performed — used to recover from a 401 during an orders call.
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

/**
 * Call the Noon orders list endpoint with the session cookie. Returns the
 * parsed JSON body and the HTTP status. If Noon responds with 401 the caller
 * can retry after forcing a re-authentication.
 */
async function callNoonOrders(
  cookie: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; statusText: string; text: string; body: unknown }> {
  const response = await fetch(NOON_ORDERS_LIST_URL, {
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

const NOON_SUCCESS_STATUS_CODES = new Set([
  "ok",
  "success",
  "successful",
  "succeeded",
  "completed",
  "200",
  "true",
])

/**
 * Inspect a Noon response body for an embedded error status. Noon frequently
 * answers with HTTP 200 but signals failure through a `status` object (or a
 * top-level `error`/`errors` field). Returns an error message string when the
 * body indicates failure, or null when the body looks successful.
 */
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

/**
 * Call the Noon orders list endpoint, transparently re-authenticating once on
 * 401. Returns the parsed response body.
 */
async function callNoonWithRetry(
  payload: Record<string, unknown>
): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  let result = await callNoonOrders(cookie, payload)

  if (result.status === 401) {
    const freshCookie = await getSessionCookie(true)
    result = await callNoonOrders(freshCookie, payload)
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

/**
 * Calculate an order's total value by summing the `delivered_invoice_price` of
 * every item in its `items` array.
 */
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

/**
 * Upsert the normalized orders into the Supabase `orders` table, keyed on the
 * unique `noon_order_id` column.
 */
async function persistOrders(orders: NormalizedOrder[]): Promise<void> {
  if (orders.length === 0) return

  const rows = orders.map((o) => ({
    noon_order_id: o.noon_order_id,
    order_date: o.order_date,
    total_price: o.total_price,
    customer_country_code: o.customer_country_code,
    status: o.status,
    raw_payload: o.raw_payload,
  }))

  const { error } = await supabase
    .from("orders")
    .upsert(rows, { onConflict: "noon_order_id" })

  if (error) {
    throw new Error(`Failed to persist orders: ${error.message}`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as {
      warehouse_code?: string
      created_after?: string
      created_before?: string
    }

    if (!parsed.warehouse_code || typeof parsed.warehouse_code !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "`warehouse_code` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const trimmedWarehouseCode = parsed.warehouse_code.trim()
    if (!WAREHOUSE_CODE_REGEX.test(trimmedWarehouseCode)) {
      return new Response(
        JSON.stringify({ ok: false, error: INVALID_WAREHOUSE_CODE_MESSAGE }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const payload: Record<string, unknown> = {
      warehouse_code: trimmedWarehouseCode,
      created_after: parsed.created_after ?? thirtyDaysAgo.toISOString(),
      created_before: parsed.created_before ?? now.toISOString(),
    }

    const responseBody = await callNoonWithRetry(payload) as NoonListResponse
    const rawOrders = Array.isArray(responseBody.orders) ? responseBody.orders : []

    const normalized = rawOrders
      .map(normalizeOrder)
      .filter((o): o is NormalizedOrder => o !== null)

    await persistOrders(normalized)

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          count: normalized.length,
          orders: normalized.map((o) => ({
            noon_order_id: o.noon_order_id,
            order_date: o.order_date,
            total_price: o.total_price,
            customer_country_code: o.customer_country_code,
            status: o.status,
          })),
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
