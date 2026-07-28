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
  mp_item_nr?: string
  item_nr?: string
  mp_item_number?: string
  fbpi_item_nr?: string
  noon_item_nr?: string
  item_id?: string
  partner_sku?: string
  mp_status?: string
  integration_status?: string
  delivered_invoice_price?: number | string | null
  [key: string]: unknown
}

type NoonOrder = {
  fbpi_order_nr?: string
  mp_order_nr?: string
  warehouse_code?: string
  order_created_at?: string
  status?: string
  items?: NoonOrderItem[]
  order_items?: NoonOrderItem[]
  line_items?: NoonOrderItem[]
  order_lines?: NoonOrderItem[]
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

async function callNoonOrdersList(
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

async function callNoonWithRetry(
  payload: Record<string, unknown>
): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  let result = await callNoonOrdersList(cookie, payload)

  if (result.status === 401) {
    const freshCookie = await getSessionCookie(true)
    result = await callNoonOrdersList(freshCookie, payload)
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

type NormalizedOrder = {
  fbpi_order_nr: string
  mp_order_nr: string | null
  warehouse_code: string | null
  order_created_at: string | null
  status: string
  raw_payload: NoonOrder
  items: NormalizedOrderItem[]
}

type NormalizedOrderItem = {
  mp_item_nr: string
  fbpi_order_nr: string
  partner_sku: string | null
  mp_status: string | null
  integration_status: string | null
  price: number
}

// Noon may return the line items under any of these keys depending on the
// endpoint and response shape.
const ITEM_ARRAY_KEYS = [
  "items",
  "order_items",
  "line_items",
  "order_lines",
] as const

// Noon may use different field names for the marketplace item number.
const ITEM_NR_KEYS = [
  "mp_item_nr",
  "item_nr",
  "mp_item_number",
  "fbpi_item_nr",
  "noon_item_nr",
  "item_id",
] as const

function extractItemsArray(order: NoonOrder): NoonOrderItem[] {
  for (const key of ITEM_ARRAY_KEYS) {
    const candidate = (order as Record<string, unknown>)[key]
    if (Array.isArray(candidate)) {
      return candidate as NoonOrderItem[]
    }
  }
  return []
}

function extractItemNr(item: NoonOrderItem): string | null {
  for (const key of ITEM_NR_KEYS) {
    const val = (item as Record<string, unknown>)[key]
    if (typeof val === "string" && val.trim() !== "") {
      return val.trim()
    }
    if (typeof val === "number" && val > 0) {
      return String(val)
    }
  }
  return null
}

function normalizeOrder(order: NoonOrder): NormalizedOrder | null {
  const orderId = order.fbpi_order_nr
  if (!orderId || typeof orderId !== "string") return null

  const rawItems = extractItemsArray(order)

  const items: NormalizedOrderItem[] = rawItems
    .map((item, idx) => {
      const mpItemNr = extractItemNr(item)
      if (!mpItemNr) {
        console.error(
          `[noon-sync-orders] Order ${orderId}: item at index ${idx} skipped — no item number found in keys [${ITEM_NR_KEYS.join(", ")}]. Item keys: ${JSON.stringify(Object.keys(item))}`
        )
        return null
      }
      return {
        mp_item_nr: mpItemNr,
        fbpi_order_nr: orderId,
        partner_sku: typeof item.partner_sku === "string" ? item.partner_sku : null,
        mp_status: typeof item.mp_status === "string" ? item.mp_status : null,
        integration_status: typeof item.integration_status === "string" ? item.integration_status : null,
        price: coerceNumber(item.delivered_invoice_price),
      }
    })
    .filter((it): it is NormalizedOrderItem => it !== null)

  if (rawItems.length > 0 && items.length === 0) {
    console.error(
      `[noon-sync-orders] Order ${orderId}: ${rawItems.length} raw item(s) found but ALL were filtered out. Checked array keys [${ITEM_ARRAY_KEYS.join(", ")}] and item-nr keys [${ITEM_NR_KEYS.join(", ")}.`
    )
  }

  return {
    fbpi_order_nr: orderId,
    mp_order_nr: typeof order.mp_order_nr === "string" ? order.mp_order_nr : null,
    warehouse_code: typeof order.warehouse_code === "string" ? order.warehouse_code : null,
    order_created_at: typeof order.order_created_at === "string" ? order.order_created_at : null,
    status: typeof order.status === "string" ? order.status : "NEW",
    raw_payload: order,
    items,
  }
}

/**
 * Upsert the normalized orders into the `orders` table, keyed on the unique
 * `fbpi_order_nr` column. We also keep the legacy `noon_order_id` and
 * `order_date` columns in sync for backward compatibility with existing
 * frontend code.
 */
async function persistOrders(orders: NormalizedOrder[]): Promise<void> {
  if (orders.length === 0) return

  const rows = orders.map((o) => ({
    fbpi_order_nr: o.fbpi_order_nr,
    noon_order_id: o.fbpi_order_nr,
    mp_order_nr: o.mp_order_nr,
    warehouse_code: o.warehouse_code,
    order_created_at: o.order_created_at,
    order_date: o.order_created_at,
    status: o.status,
    raw_payload: o.raw_payload,
  }))

  const { error } = await supabase
    .from("orders")
    .upsert(rows, { onConflict: "fbpi_order_nr" })

  if (error) {
    throw new Error(`Failed to persist orders: ${error.message}`)
  }
}

/**
 * Upsert the line items for all orders into the `order_items` table, keyed on
 * `mp_item_nr`.
 */
async function persistOrderItems(orders: NormalizedOrder[]): Promise<void> {
  const allItems = orders.flatMap((o) => o.items)
  if (allItems.length === 0) return

  for (const item of allItems) {
    const { error } = await supabase
      .from("order_items")
      .upsert(item, { onConflict: "mp_item_nr" })

    if (error) {
      console.error(
        `[noon-sync-orders] Failed to upsert order item mp_item_nr=${item.mp_item_nr} ` +
        `fbpi_order_nr=${item.fbpi_order_nr}: ${error.message} ` +
        `(code=${error.code ?? "unknown"}, details=${error.details ?? "none"})`
      )
      throw new Error(`Failed to persist order item ${item.mp_item_nr}: ${error.message}`)
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as {
      warehouse_code?: string
    }

    if (!parsed.warehouse_code || typeof parsed.warehouse_code !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "`warehouse_code` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const warehouseCode = parsed.warehouse_code.trim()
    if (!warehouseCode) {
      return new Response(
        JSON.stringify({ ok: false, error: "`warehouse_code` must not be empty." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Per the task, ignore date filters for now to fetch all available orders.
    const payload: Record<string, unknown> = {
      warehouse_code: warehouseCode,
    }

    const responseBody = await callNoonWithRetry(payload) as NoonListResponse
    const rawOrders = Array.isArray(responseBody.orders) ? responseBody.orders : []

    const normalized = rawOrders
      .map(normalizeOrder)
      .filter((o): o is NormalizedOrder => o !== null)

    await persistOrders(normalized)
    await persistOrderItems(normalized)

    const totalItems = normalized.reduce((sum, o) => sum + o.items.length, 0)

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          count: normalized.length,
          total_items: totalItems,
          orders: normalized.map((o) => ({
            fbpi_order_nr: o.fbpi_order_nr,
            mp_order_nr: o.mp_order_nr,
            warehouse_code: o.warehouse_code,
            order_created_at: o.order_created_at,
            status: o.status,
            item_count: o.items.length,
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
