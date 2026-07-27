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

export type SyncStage = "initializing" | "waiting" | "downloading" | "syncing" | "done"

export type SyncProgress = {
  stage: SyncStage
  message: string
  exportCode?: string
  upserted?: number
}

export type SyncResult = {
  ok: boolean
  exportCode?: string
  upserted?: number
  error?: string
}

/**
 * Run the full Noon catalog sync by driving the noon-sync-catalog edge
 * function. The `onProgress` callback receives stage updates so the UI can
 * show a descriptive loading state at each step.
 */
export async function syncNoonCatalog(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const report = (progress: SyncProgress) => onProgress?.(progress)

  try {
    report({ stage: "initializing", message: "Initializing export…" })

    const createResult = (await callNoonFunction("noon-sync-catalog", {
      action: "create",
    })) as { ok: boolean; export_code?: string; error?: string }

    if (!createResult.ok || !createResult.export_code) {
      throw new Error(createResult.error ?? "Failed to create Noon export")
    }

    const exportCode = createResult.export_code

    report({
      stage: "waiting",
      message: "Waiting for report…",
      exportCode,
    })

    const statusResult = (await callNoonFunction("noon-sync-catalog", {
      action: "sync",
      export_code: exportCode,
    })) as { ok: boolean; upserted?: number; error?: string }

    if (!statusResult.ok) {
      throw new Error(statusResult.error ?? "Noon sync failed")
    }

    report({
      stage: "syncing",
      message: "Syncing products…",
      exportCode,
    })

    report({
      stage: "done",
      message: `Synced ${statusResult.upserted ?? 0} products`,
      exportCode,
      upserted: statusResult.upserted,
    })

    return {
      ok: true,
      exportCode,
      upserted: statusResult.upserted,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error"
    return { ok: false, error: message }
  }
}

export type NoonOrder = {
  id: string
  noon_order_id: string
  order_date: string
  total_price: number
  status: string
}

export type NoonOrdersResult = {
  ok: boolean
  status: number
  data: unknown
}

// Noon FBPI pushes orders via webhooks — there is no polling GET endpoint.
// The "Sync Orders" button in the UI re-reads orders from our own database
// (populated by the noon-webhook-receiver edge function) instead of calling
// Noon. fetchNoonOrders is retained only as a local DB read for callers that
// still import it.
import { supabase } from "@/lib/supabase"

export async function fetchNoonOrders(): Promise<NoonOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, noon_order_id, order_date, total_price, status")
    .order("order_date", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    noon_order_id: String(row.noon_order_id),
    order_date: String(row.order_date),
    total_price: Number(row.total_price),
    status: row.status ?? "Pending",
  }))
}
