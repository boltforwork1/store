export type NoonStockItem = {
  warehouse_code: string
  partner_sku: string
  qty: number
}

export type NoonStockLookupItem = {
  warehouse_code: string
  partner_sku: string
}

export type NoonPriceItem = {
  partner_sku: string
  price: number
  msrp: number
  is_active: boolean
}

export type NoonDeliveryModeItem = {
  partner_sku: string
  delivery_mode: string
}

export type NoonResult = {
  ok: boolean
  status: number
  data: unknown
  url?: string
  error?: string
}

async function callNoonFunction(
  slug: string,
  payload: unknown
): Promise<NoonResult> {
  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }

  const response = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  if (!response.ok) {
    const message =
      (body as { error?: string })?.error ??
      `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return body as NoonResult
}

export function fetchNoonStock(items: NoonStockLookupItem[]): Promise<NoonResult> {
  return callNoonFunction("noon-stock-api", { action: "get", items })
}

export function updateNoonStock(items: NoonStockItem[]): Promise<NoonResult> {
  return callNoonFunction("noon-stock-api", { action: "update", items })
}

export function updateNoonPrices(items: NoonPriceItem[]): Promise<NoonResult> {
  return callNoonFunction("noon-price-update", { items })
}

export function updateNoonDeliveryMode(
  items: NoonDeliveryModeItem[]
): Promise<NoonResult> {
  return callNoonFunction("noon-fbpi-update", { items })
}

export function acknowledgeNoonOrder(orderId: string): Promise<NoonResult> {
  return callNoonFunction("noon-ack-order", { order_id: orderId })
}

export function createNoonShipment(orderId: string): Promise<NoonResult> {
  return callNoonFunction("noon-create-shipment", { order_id: orderId })
}

export function printNoonLabel(orderId: string): Promise<NoonResult> {
  return callNoonFunction("noon-print-label", { order_id: orderId })
}

import Papa from "papaparse"
import { supabase } from "@/lib/supabase"

export type CatalogImportRow = {
  partner_sku: string
  name: string | null
  price: number | null
  msrp: number | null
  stock_qty: number | null
  delivery_mode: string | null
  is_active: boolean | null
}

export type CatalogImportResult = {
  ok: boolean
  upserted?: number
  total?: number
  skipped?: number
  error?: string
}

const FIELD_ALIASES: Record<keyof CatalogImportRow, string[]> = {
  partner_sku: ["partner_sku", "partner sku", "sku", "Partner SKU", "SKU"],
  name: ["name", "title", "product_name", "product name", "Title", "Name"],
  price: ["price", "selling_price", "selling price", "Price"],
  msrp: ["msrp", "retail_price", "retail price", "MSRP"],
  stock_qty: ["stock_qty", "stock", "qty", "quantity", "Stock"],
  delivery_mode: ["delivery_mode", "delivery mode", "Delivery Mode"],
  is_active: ["is_active", "active", "status", "Active"],
}

function pickField(
  row: Record<string, unknown>,
  field: keyof CatalogImportRow
): unknown {
  const aliases = FIELD_ALIASES[field]
  for (const alias of aliases) {
    if (alias in row && row[alias] !== undefined && row[alias] !== "") {
      return row[alias]
    }
  }
  return undefined
}

function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return isNaN(n) ? null : n
}

function coerceBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "boolean") return value
  const s = String(value).toLowerCase()
  if (["true", "1", "yes", "active", "y"].includes(s)) return true
  if (["false", "0", "no", "inactive", "n"].includes(s)) return false
  return null
}

function mapRow(row: Record<string, unknown>): CatalogImportRow | null {
  const sku = pickField(row, "partner_sku")
  if (!sku) return null

  const partnerSku = String(sku).trim()
  const rawName = pickField(row, "name") as string | undefined
  const rawPrice = coerceNumber(pickField(row, "price"))
  const rawStock = coerceNumber(pickField(row, "stock_qty"))

  return {
    partner_sku: partnerSku,
    name: rawName && rawName !== "" ? rawName : `Product ${partnerSku}`,
    price: rawPrice ?? 0,
    msrp: coerceNumber(pickField(row, "msrp")),
    stock_qty: rawStock ?? 0,
    delivery_mode: (pickField(row, "delivery_mode") as string) ?? null,
    is_active: coerceBool(pickField(row, "is_active")),
  }
}

/**
 * Parse a CSV/Excel-derived file (as a File object) and upsert the products
 * into the Supabase products table. Noon does not expose a public bulk catalog
 * export API, so users export a CSV from the Noon Partner Portal and upload it
 * here. Returns counts of upserted, total parsed, and skipped rows.
 */
export async function importCatalogFromFile(
  file: File
): Promise<CatalogImportResult> {
  try {
    const text = await file.text()
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    })

    const rows = (parsed.data ?? [])
      .map(mapRow)
      .filter((r): r is CatalogImportRow => r !== null)

    if (rows.length === 0) {
      return {
        ok: false,
        error:
          "No valid product rows found. Ensure the file has a partner_sku/SKU column.",
      }
    }

    const { error } = await supabase
      .from("products")
      .upsert(rows, { onConflict: "partner_sku" })

    if (error) {
      return { ok: false, error: error.message }
    }

    return {
      ok: true,
      upserted: rows.length,
      total: parsed.data.length,
      skipped: parsed.data.length - rows.length,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse file"
    return { ok: false, error: message }
  }
}

export type NoonFetchedOrder = {
  noon_order_id: string
  order_date: string | null
  total_price: number
  customer_country_code: string | null
  status: string
}

export type NoonOrdersResult = {
  ok: boolean
  count?: number
  orders?: NoonFetchedOrder[]
  error?: string
}

// Strict warehouse code format: alphanumeric, underscores, hyphens, min 5 chars.
// Noon does not validate this server-side, so we enforce it on both the client
// and edge function to prevent bogus codes from silently returning empty lists.
export const WAREHOUSE_CODE_REGEX = /^[A-Za-z0-9_-]{5,}$/
export const INVALID_WAREHOUSE_CODE_MESSAGE =
  "Invalid Warehouse Code. Please enter a valid Noon warehouse code (e.g., W00012345A)."

/**
 * Fetch live orders from the Noon FBPI orders list endpoint via the
 * `noon-orders-api` edge function. The function persists the fetched orders
 * into the `orders` table (upserted on `noon_order_id`) and returns the
 * normalized rows so the UI can update immediately.
 */
export async function fetchNoonOrdersApi(params: {
  warehouse_code: string
  created_after?: string
  created_before?: string
}): Promise<NoonOrdersResult> {
  const result = await callNoonFunction("noon-orders-api", params)
  const data = (result.data ?? {}) as { count?: number; orders?: NoonFetchedOrder[] }
  return { ok: result.ok, count: data.count, orders: data.orders, error: result.error }
}
