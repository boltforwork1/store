import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_BASE = "https://noon-api-gateway.noon.partners"
const NOON_STOCK_LIST_URL = `${NOON_BASE}/stock/v1/stock-list`

// Per the Noon Partner API spec, ALL requests must include a User-Agent header
// identifying the application. Requests without it may be rejected.
const USER_AGENT = "NexCommerce/1.0.0"

// Noon's stock-list endpoint accepts a batch of items. We chunk to stay safely
// below any undocumented request-size limit and keep each call fast.
const BATCH_SIZE = 500

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

type StockItem = {
  warehouse_code: string
  partner_sku: string
}

type StockRequestBody = {
  items: StockItem[]
}

type NoonStockResponseItem = {
  warehouse_code?: string
  partner_sku?: string
  qty?: number
  status?: { status_code?: string; message?: string }
}

/**
 * Fetch a valid Noon session cookie from the noon-auth edge function. When
 * `force` is true the cached cookie is invalidated and a fresh login is
 * performed — used to recover from a 401 during a stock call.
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

async function callNoonStockList(
  cookie: string,
  payload: StockRequestBody
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(NOON_STOCK_LIST_URL, {
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

  return { status: response.status, body }
}

/**
 * Call the Noon stock-list endpoint, transparently re-authenticating once on
 * 401. Returns the parsed response body.
 */
async function callNoonWithRetry(payload: StockRequestBody): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  const first = await callNoonStockList(cookie, payload)

  if (first.status === 401) {
    const freshCookie = await getSessionCookie(true)
    const retry = await callNoonStockList(freshCookie, payload)

    if (retry.status !== 200) {
      throw new Error(
        `Noon stock-list failed after re-auth (${retry.status}): ${JSON.stringify(retry.body)}`
      )
    }

    return retry.body
  }

  if (first.status !== 200) {
    throw new Error(
      `Noon stock-list failed (${first.status}): ${JSON.stringify(first.body)}`
    )
  }

  return first.body
}

/**
 * Extract the `items` array from a Noon stock-list response. The array may be
 * at the top level or nested under `data`/`result`.
 */
function extractItems(body: unknown): NoonStockResponseItem[] {
  if (!body || typeof body !== "object") return []
  const obj = body as Record<string, unknown>

  const candidates: unknown[] = [obj.items, (obj.data as Record<string, unknown>)?.items, (obj.result as Record<string, unknown>)?.items]
  for (const c of candidates) {
    if (Array.isArray(c)) return c as NoonStockResponseItem[]
  }
  return []
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as { warehouse_code?: string }

    const warehouseCode = parsed.warehouse_code?.trim()
    if (!warehouseCode) {
      return new Response(
        JSON.stringify({ ok: false, error: "`warehouse_code` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 1. Fetch all partner_skus from the products table.
    const { data: productRows, error: fetchError } = await supabase
      .from("products")
      .select("partner_sku")
      .order("partner_sku")

    if (fetchError) {
      throw new Error(`Failed to fetch products: ${fetchError.message}`)
    }

    const skus = (productRows ?? [])
      .map((r) => (r as { partner_sku: string }).partner_sku)
      .filter((s) => typeof s === "string" && s.trim() !== "")

    if (skus.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, data: { total_products: 0, synced: 0, updated: 0, batches: 0 } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. Build batched payloads and call Noon stock-list for each chunk.
    const batches = chunk(skus, BATCH_SIZE)
    const qtyBySku = new Map<string, number>()

    for (const batch of batches) {
      const payload: StockRequestBody = {
        items: batch.map((partner_sku) => ({ warehouse_code: warehouseCode, partner_sku })),
      }

      const responseBody = await callNoonWithRetry(payload)
      const responseItems = extractItems(responseBody)

      for (const item of responseItems) {
        const sku = item.partner_sku
        if (typeof sku !== "string" || !sku) continue
        const qty = Number(item.qty ?? 0)
        qtyBySku.set(sku, isNaN(qty) ? 0 : qty)
      }
    }

    // 3. Bulk update the products table with the retrieved quantities.
    // Products not present in the Noon response are treated as 0 stock.
    let updated = 0
    const updateBatches = chunk(skus, 500)

    for (const batch of updateBatches) {
      const updates = batch.map((sku) => {
        const qty = qtyBySku.get(sku) ?? 0
        return {
          partner_sku: sku,
          stock_qty: qty,
          is_active: qty > 0,
        }
      })

      const { error: updateError } = await supabase
        .from("products")
        .upsert(updates, { onConflict: "partner_sku" })

      if (updateError) {
        throw new Error(`Failed to update products: ${updateError.message}`)
      }

      updated += updates.length
    }

    const synced = qtyBySku.size

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          total_products: skus.length,
          synced,
          updated,
          batches: batches.length,
          warehouse_code: warehouseCode,
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
