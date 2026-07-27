import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_BASE = "https://noon-api-gateway.noon.partners"
const NOON_ORDERS_LIST_URL = `${NOON_BASE}/fbpi/v1/fbpi-orders/list`

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
): Promise<{ status: number; statusText: string; body: unknown }> {
  const response = await fetch(NOON_ORDERS_LIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  return { status: response.status, statusText: response.statusText, body }
}

/**
 * Call the Noon orders list endpoint, transparently re-authenticating once on
 * 401. Returns the parsed response body.
 */
async function callNoonWithRetry(
  payload: Record<string, unknown>
): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  const first = await callNoonOrders(cookie, payload)

  if (first.status === 401) {
    const freshCookie = await getSessionCookie(true)
    const retry = await callNoonOrders(freshCookie, payload)

    if (retry.status !== 200) {
      throw new Error(
        `Noon API Error [${retry.status} ${retry.statusText}]: ${extractNoonError(retry.body) || "No body"}`
      )
    }

    return retry.body
  }

  if (first.status !== 200) {
    throw new Error(
      `Noon API Error [${first.status} ${first.statusText}]: ${extractNoonError(first.body) || "No body"}`
    )
}

  return first.body
}

/**
 * Extract a human-readable error message from a Noon API error response. Noon
 * typically returns `{ error: { message: "..." } }` or `{ message: "..." }`, but
 * may also return a plain string or arbitrary JSON. We surface the most useful
 * detail so the caller can see exactly what Noon complained about.
 */
function extractNoonError(body: unknown): string {
  if (body === null || body === undefined || body === "") {
    return "No response body from Noon"
  }

  if (typeof body === "string") {
    return body
  }

  if (typeof body === "object") {
    const b = body as Record<string, unknown>
    const err = b.error as Record<string, unknown> | undefined
    if (err && typeof err.message === "string") return err.message
    if (typeof b.message === "string") return b.message
    if (typeof b.error === "string") return b.error
    if (typeof b.detail === "string") return b.detail
  }

  return JSON.stringify(body)
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

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const payload: Record<string, unknown> = {
      warehouse_code: parsed.warehouse_code.trim(),
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
