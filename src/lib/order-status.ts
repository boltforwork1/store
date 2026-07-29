import type { OrderItem } from "@/lib/types"

export const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  PENDING: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  Pending: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  Fetched: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  Processing: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  ACKNOWLEDGED: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
  Acknowledged: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
  CONFIRMED: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
  Confirmed: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
  Completed: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
  Shipped: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-900",
  SHIPPED: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-900",
  CANCELLED: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  Cancelled: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  OUT_OF_STOCK: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  OOS: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  CANCELLED_BY_CUSTOMER: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  Refunded: "bg-muted text-muted-foreground border-border",
}

const STATUS_PREFIXES = ["MP_ITEM_STATUS_", "INTEGRATION_ITEM_STATUS_"]

export const CANCELLED_OR_OOS = ["CANCELLED", "OUT_OF_STOCK", "OOS", "CANCELLED_BY_CUSTOMER"]

export function statusStyleKey(raw: string | null): string {
  if (!raw) return ""
  let s = raw.toUpperCase()
  for (const p of STATUS_PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length)
      break
    }
  }
  return s
}

export function formatItemStatus(raw: string | null): string {
  if (!raw) return "—"
  let s = raw
  for (const p of STATUS_PREFIXES) {
    if (s.toUpperCase().startsWith(p)) {
      s = s.slice(p.length)
      break
    }
  }
  s = s.replace(/_/g, " ").toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function statusBadgeClass(raw: string | null): string {
  return STATUS_STYLES[statusStyleKey(raw)] ?? "bg-muted text-muted-foreground border-border"
}

/**
 * Dynamic parent order status: if all line items are cancelled or OOS,
 * display the order as CANCELLED regardless of the stored status.
 */
export function computeDisplayStatus(
  storedStatus: string | null,
  items: OrderItem[] | undefined,
): string {
  if (items && items.length > 0) {
    const allCancelledOrOos = items.every(
      (it) =>
        CANCELLED_OR_OOS.includes(statusStyleKey(it.mp_status)) ||
        CANCELLED_OR_OOS.includes(statusStyleKey(it.integration_status))
    )
    if (allCancelledOrOos) return "CANCELLED"
  }
  return storedStatus ?? "NEW"
}
