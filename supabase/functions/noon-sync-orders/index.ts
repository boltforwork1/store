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
  partner_sku: string
  mp_status: string
  integration_status: string
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

  const items: NormalizedOrderItem[] = rawItems.map((item, idx) => {
    // Strict fallbacks: NO required column is ever null/undefined.
    const mpItemNr =
      extractItemNr(item) ||
      `TEST-ITEM-${Math.random().toString(36).substring(2, 9)}`
    const partnerSku = item.partner_sku || "UNKNOWN-SKU"
    const price = coerceNumber(item.delivered_invoice_price || item.price || 0)
    const mpStatus = item.mp_status || "MP_ITEM_STATUS_UNSPECIFIED"
    const integrationStatus =
      item.integration_status || "INTEGRATION_ITEM_STATUS_UNSPECIFIED"

    if (!extractItemNr(item)) {
      console.error(
        `[noon-sync-orders] Order ${orderId}: item at index ${idx} had no item number in keys [${ITEM_NR_KEYS.join(", ")}]. Generated synthetic mp_item_nr=${mpItemNr}. Item keys: ${JSON.stringify(Object.keys(item))}`
      )
    }

    return {
      mp_item_nr: mpItemNr,
      fbpi_order_nr: orderId,
      partner_sku: partnerSku,
      mp_status: mpStatus,
      integration_status: integrationStatus,
      price,
    }
  })

  if (rawItems.length > 0 && items.length === 0) {
    console.error(
      `[noon-sync-orders] Order ${orderId}: ${rawItems.length} raw item(s) found but NONE could be normalized.`
    )
  }
  if (rawItems.length === 0) {
    console.error(
      `[noon-sync-orders] Order ${orderId}: no items array found. Checked keys [${ITEM_ARRAY_KEYS.join(", ")}]. Order keys: ${JSON.stringify(Object.keys(order))}`
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
 * Persist each order and its items SEQUENTIALLY: the parent order is upserted
 * and awaited first, and only after it succeeds are its child items upserted.
 * This eliminates Foreign Key race conditions where an item references a parent
 * row that has not yet been committed.
 */
async function persistOrdersWithItems(
  orders: NormalizedOrder[]
): Promise<{ savedOrders: number; savedItems: number }> {
  let savedOrders = 0
  let savedItems = 0

  for (const order of orders) {
    // 1. Upsert the parent order and await completion before touching items.
    const orderRow = {
      fbpi_order_nr: order.fbpi_order_nr,
      noon_order_id: order.fbpi_order_nr,
      mp_order_nr: order.mp_order_nr,
      warehouse_code: order.warehouse_code,
      order_created_at: order.order_created_at,
      order_date: order.order_created_at,
      status: order.status,
      raw_payload: order.raw_payload,
    }

    const { error: orderError } = await supabase
      .from("orders")
      .upsert(orderRow, { onConflict: "fbpi_order_nr" })

    if (orderError) {
      console.error(
        `[noon-sync-orders] Failed to upsert parent order ` +
        `fbpi_order_nr=${order.fbpi_order_nr}: ${orderError.message} ` +
        `(code=${orderError.code ?? "unknown"})`
      )
      throw new Error(
        `Failed to persist order ${order.fbpi_order_nr}: ${orderError.message}`
      )
    }
    savedOrders++

    // 2. Parent is now guaranteed to exist — upsert this order's items.
    for (const item of order.items) {
      try {
        const { error: itemError } = await supabase
          .from("order_items")
          .upsert(
            {
              mp_item_nr: item.mp_item_nr,
              fbpi_order_nr: order.fbpi_order_nr,
              partner_sku: item.partner_sku,
              mp_status: item.mp_status,
              integration_status: item.integration_status,
              price: item.price,
            },
            { onConflict: "mp_item_nr" }
          )

        if (itemError) {
          console.error("Item UPSERT error:", itemError)
          throw new Error(
            `Failed to persist order item ${item.mp_item_nr}: ${itemError.message}`
          )
        }
        savedItems++
      } catch (error) {
        console.error("Item UPSERT error:", error)
        throw error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  return { savedOrders, savedItems }
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

    const { savedOrders, savedItems } = await persistOrdersWithItems(normalized)

    const totalItems = savedItems

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          count: savedOrders,
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
