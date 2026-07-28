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
  price?: number | string | null
  [key: string]: unknown
}

type NoonOrder = {
  fbpi_order_nr?: string
  mp_order_nr?: string
  warehouse_code?: string
  order_created_at?: string
  status?: string
  customer_country_code?: string
  items?: NoonOrderItem[]
  order_items?: NoonOrderItem[]
  line_items?: NoonOrderItem[]
  order_lines?: NoonOrderItem[]
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

type NormalizedOrderItem = {
  mp_item_nr: string
  fbpi_order_nr: string
  partner_sku: string
  mp_status: string
  integration_status: string
  price: number
}

type NormalizedOrder = {
  fbpi_order_nr: string
  noon_order_id: string
  mp_order_nr: string | null
  warehouse_code: string | null
  order_created_at: string | null
  order_date: string | null
  total_price: number
  customer_country_code: string | null
  status: string
  raw_payload: NoonOrder
  items: NormalizedOrderItem[]
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

  const rawItems = extractItemsArray(order)

  const items: NormalizedOrderItem[] = rawItems.map((item, idx) => {
    const mpItemNr =
      extractItemNr(item) ||
      `ITEM-${orderId}-${idx}-${Math.random().toString(36).substring(2, 7)}`
    const partnerSku = item.partner_sku || "UNKNOWN-SKU"
    const price = coerceNumber(item.delivered_invoice_price || item.price || 0)
    const mpStatus = item.mp_status || "MP_ITEM_STATUS_UNSPECIFIED"
    const integrationStatus =
      item.integration_status || "INTEGRATION_ITEM_STATUS_UNSPECIFIED"

    if (!extractItemNr(item)) {
      console.error(
        `[noon-get-order-by-id] Order ${orderId}: item at index ${idx} had no item number in keys [${ITEM_NR_KEYS.join(", ")}]. Generated synthetic mp_item_nr=${mpItemNr}. Item keys: ${JSON.stringify(Object.keys(item))}`
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

  if (rawItems.length === 0) {
    console.error(
      `[noon-get-order-by-id] Order ${orderId}: no items array found. Checked keys [${ITEM_ARRAY_KEYS.join(", ")}]. Order keys: ${JSON.stringify(Object.keys(order))}`
    )
  }

  const total = items.reduce((sum, item) => sum + item.price, 0)

  return {
    fbpi_order_nr: orderId,
    noon_order_id: orderId,
    mp_order_nr: typeof order.mp_order_nr === "string" ? order.mp_order_nr : null,
    warehouse_code: typeof order.warehouse_code === "string" ? order.warehouse_code : null,
    order_created_at: typeof order.order_created_at === "string" ? order.order_created_at : null,
    order_date: typeof order.order_created_at === "string" ? order.order_created_at : null,
    total_price: total,
    customer_country_code: typeof order.customer_country_code === "string" ? order.customer_country_code : null,
    status: typeof order.status === "string" ? order.status : "NEW",
    raw_payload: order,
    items,
  }
}

/**
 * Persist the parent order first, then its line items sequentially. The parent
 * must be committed before items are upserted to satisfy the foreign key.
 */
async function persistOrderWithItems(
  order: NormalizedOrder
): Promise<{ savedItems: number }> {
  const orderRow = {
    fbpi_order_nr: order.fbpi_order_nr,
    noon_order_id: order.noon_order_id,
    mp_order_nr: order.mp_order_nr,
    warehouse_code: order.warehouse_code,
    order_created_at: order.order_created_at,
    order_date: order.order_date,
    total_price: order.total_price,
    customer_country_code: order.customer_country_code,
    status: order.status,
    raw_payload: order.raw_payload,
  }

  const { error: orderError } = await supabase
    .from("orders")
    .upsert(orderRow, { onConflict: "fbpi_order_nr" })

  if (orderError) {
    throw new Error(
      `Failed to persist order ${order.fbpi_order_nr}: ${orderError.message}`
    )
  }

  let savedItems = 0
  for (const item of order.items) {
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
      throw new Error(
        `Failed to persist order item ${item.mp_item_nr}: ${itemError.message}`
      )
    }
    savedItems++
  }

  return { savedItems }
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

    const { savedItems } = await persistOrderWithItems(normalized)

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          order: {
            fbpi_order_nr: normalized.fbpi_order_nr,
            noon_order_id: normalized.noon_order_id,
            mp_order_nr: normalized.mp_order_nr,
            warehouse_code: normalized.warehouse_code,
            order_created_at: normalized.order_created_at,
            total_price: normalized.total_price,
            customer_country_code: normalized.customer_country_code,
            status: normalized.status,
            item_count: savedItems,
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
