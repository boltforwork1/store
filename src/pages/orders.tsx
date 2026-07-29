import React, { useCallback, useEffect, useState } from "react"
import { Search, Download, RefreshCw, Database, Loader as Loader2, ShoppingCart, Warehouse, ChevronRight, ChevronDown, Boxes, ListFilter as Filter, Ban, TriangleAlert as AlertTriangle, Truck, PackageCheck, Wrench, Printer, X, ImageOff, Trash2 } from "lucide-react"
import { ShippingLabel } from "@/components/shipping-label"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase"
import { syncNoonOrders, markItemOos, createNoonShipment, createNoonSandboxOrder, cancelNoonShipment, generateNoonAwb } from "@/lib/noon"
import type { Order, OrderItem } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  STATUS_STYLES,
  statusStyleKey,
  formatItemStatus,
  statusBadgeClass,
  computeDisplayStatus,
  computeDisplayTotal,
  isRevenueEligible,
  CANCELLED_OR_OOS,
} from "@/lib/order-status"

type OrderWithItemCount = Order & { item_count: number; awb_nr: string | null; integration_shipment_nr: string | null }

type ProductInfo = {
  name: string | null
  image_url: string | null
}

type EnrichedOrderItem = OrderItem & { product_name: string | null; product_image: string | null }

export function OrdersPage() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [creatingTestOrder, setCreatingTestOrder] = useState(false)
  const [clearingTestOrders, setClearingTestOrders] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [orders, setOrders] = useState<OrderWithItemCount[]>([])
  const [activeTab, setActiveTab] = useState("all")
  const [search, setSearch] = useState("")
  const [warehouseCode, setWarehouseCode] = useState("W00210108EG")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, EnrichedOrderItem[]>>({})
  const [loadingItems, setLoadingItems] = useState<string | null>(null)
  const [oosTarget, setOosTarget] = useState<{ fbpi_order_nr: string; mp_item_nr: string } | null>(null)
  const [markingOos, setMarkingOos] = useState(false)
  const [oosItemNr, setOosItemNr] = useState<string | null>(null)
  const [shipmentTarget, setShipmentTarget] = useState<OrderWithItemCount | null>(null)
  const [shipmentAwb, setShipmentAwb] = useState("")
  const [shipmentSelectedItems, setShipmentSelectedItems] = useState<Set<string>>(new Set())
  const [creatingShipment, setCreatingShipment] = useState(false)
  const [generatingAwb, setGeneratingAwb] = useState(false)
  const [labelTarget, setLabelTarget] = useState<OrderWithItemCount | null>(null)
  const [cancelTarget, setCancelTarget] = useState<OrderWithItemCount | null>(null)
  const [cancellingShipment, setCancellingShipment] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        noon_order_id,
        fbpi_order_nr,
        mp_order_nr,
        warehouse_code,
        order_date,
        order_created_at,
        total_price,
        status,
        customer_country_code,
        awb_nr,
        integration_shipment_nr
      `)
      .order("order_created_at", { ascending: false, nullsFirst: false })

    if (error) {
      console.error("Failed to load orders:", error.message)
      setOrders([])
    } else {
      // Fetch item counts per order in a single query.
      const orderKeys = (data ?? [])
        .map((o) => o.fbpi_order_nr)
        .filter((k): k is string => typeof k === "string" && k.trim() !== "")

      let countMap: Record<string, number> = {}
      const statusItemsByOrder: Record<string, EnrichedOrderItem[]> = {}
      if (orderKeys.length > 0) {
        const { data: itemsData, error: itemsError } = await supabase
          .from("order_items")
          .select("mp_item_nr, fbpi_order_nr, partner_sku, mp_status, integration_status, price")
          .in("fbpi_order_nr", orderKeys)
          .order("mp_item_nr")

        if (!itemsError && itemsData) {
          for (const it of itemsData as OrderItem[]) {
            countMap[it.fbpi_order_nr] = (countMap[it.fbpi_order_nr] ?? 0) + 1
            if (!statusItemsByOrder[it.fbpi_order_nr]) {
              statusItemsByOrder[it.fbpi_order_nr] = []
            }
            statusItemsByOrder[it.fbpi_order_nr].push({
              ...it,
              product_name: null,
              product_image: null,
            })
          }
        }
      }

      const rows = (data ?? []).map((o) => ({
        ...(o as Order),
        item_count: countMap[o.fbpi_order_nr ?? ""] ?? 0,
        awb_nr: (o as { awb_nr?: string | null }).awb_nr ?? null,
        integration_shipment_nr: (o as { integration_shipment_nr?: string | null }).integration_shipment_nr ?? null,
      })) as OrderWithItemCount[]

      setOrders(rows)
      // Seed itemsByOrder with status-only data for every order so the
      // dynamic parent status (displayOrderStatus) is correct even before a
      // row is expanded. Product name/image enrichment happens lazily on expand.
      setItemsByOrder((prev) => {
        const next: Record<string, EnrichedOrderItem[]> = { ...prev }
        for (const [k, v] of Object.entries(statusItemsByOrder)) {
          // Don't overwrite already-enriched items (e.g. from a prior expand).
          if (!next[k] || next[k].every((it) => it.product_name === null && it.product_image === null)) {
            next[k] = v
          }
        }
        return next
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function runSyncOrders(warehouse: string, loadingLabel = "Syncing orders from Noon…") {
    if (!warehouse) {
      toast.error("Warehouse code is required")
      return
    }

    setSyncing(true)
    const toastId = toast.loading(loadingLabel)

    try {
      const result = await syncNoonOrders({ warehouse_code: warehouse })

      if (!result.ok) {
        toast.error(result.error || "Failed to sync orders", { id: toastId })
        return
      }

      const count = result.count ?? 0
      const totalItems = result.total_items ?? 0
      toast.success(
        `Synced ${count} order${count === 1 ? "" : "s"} with ${totalItems} line item${totalItems === 1 ? "" : "s"}`,
        { id: toastId }
      )
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setSyncing(false)
    }
  }

  function handleSyncOrders(e: React.FormEvent) {
    e.preventDefault()
    void runSyncOrders(warehouseCode.trim())
  }

  async function handleClearTestOrders() {
    setClearingTestOrders(true)
    const toastId = toast.loading("Clearing test orders…")

    try {
      const { data: testOrders, error: fetchError } = await supabase
        .from("orders")
        .select("fbpi_order_nr")
        .like("fbpi_order_nr", "TEST-%")

      if (fetchError) {
        toast.error(fetchError.message, { id: toastId })
        return
      }

      const testOrderNrs = (testOrders ?? [])
        .map((o) => o.fbpi_order_nr)
        .filter((nr): nr is string => nr != null)

      if (testOrderNrs.length === 0) {
        toast.info("No test orders found to clear.", { id: toastId })
        return
      }

      const { error: itemsError } = await supabase
        .from("order_items")
        .delete()
        .in("fbpi_order_nr", testOrderNrs)

      if (itemsError) {
        toast.error(itemsError.message, { id: toastId })
        return
      }

      const { error: ordersError } = await supabase
        .from("orders")
        .delete()
        .in("fbpi_order_nr", testOrderNrs)

      if (ordersError) {
        toast.error(ordersError.message, { id: toastId })
        return
      }

      toast.success(`Deleted ${testOrderNrs.length} test order${testOrderNrs.length === 1 ? "" : "s"}.`, { id: toastId })
      setClearConfirmOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setClearingTestOrders(false)
    }
  }

  async function handleCreateTestOrder() {
    const warehouse = warehouseCode.trim() || "W00210108EG"

    setCreatingTestOrder(true)
    const toastId = toast.loading("Creating test order in Noon sandbox…")

    try {
      const result = await createNoonSandboxOrder({ warehouse_code: warehouse })

      if (!result.ok || !result.fbpi_order_nr) {
        toast.error(result.error || "Failed to create test order", { id: toastId })
        return
      }

      const itemCount = result.item_count
      if (itemCount != null && itemCount > 0) {
        toast.success(
          `Test order ${result.fbpi_order_nr} created with ${itemCount} item${itemCount === 1 ? "" : "s"}`,
          { id: toastId }
        )
      } else if (result.fetch_error) {
        toast.warning(
          `Test order created (${result.fbpi_order_nr}) but item fetch failed. Syncing…`,
          { id: toastId }
        )
        await runSyncOrders(warehouse, "Syncing the new test order…")
      } else {
        toast.success(`Test order ${result.fbpi_order_nr} created!`, { id: toastId })
      }

      // Always refresh the orders list so the new test order (and its item
      // count) appears immediately in the UI.
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setCreatingTestOrder(false)
    }
  }

  const OOS_BLOCKED_STATUSES = new Set([
    "OUT_OF_STOCK",
    "SHIPPED",
    "CANCELLED",
    "CANCELLED_BY_CUSTOMER",
    "DELIVERED",
    "RETURNED",
    "REFUNDED",
  ])

  function canMarkOos(item: OrderItem): boolean {
    const integration = statusStyleKey(item.integration_status)
    const mp = statusStyleKey(item.mp_status)
    if (OOS_BLOCKED_STATUSES.has(integration)) return false
    if (OOS_BLOCKED_STATUSES.has(mp)) return false
    return true
  }

  const ORDER_TERMINAL_STATUSES = new Set(["CANCELLED", "SHIPPED", "COMPLETED"])

  // An order is fulfillable if it is not in a terminal state and has at least
  // one item that is not shipped, cancelled, or out of stock.
  function isOrderFulfillable(order: OrderWithItemCount): boolean {
    if (ORDER_TERMINAL_STATUSES.has(displayOrderStatus(order))) return false
    const items = order.fbpi_order_nr ? itemsByOrder[order.fbpi_order_nr] : undefined
    if (!items || items.length === 0) return false
    return items.some((it) => canMarkOos(it))
  }

  function displayOrderStatus(order: OrderWithItemCount): string {
    const items = order.fbpi_order_nr ? itemsByOrder[order.fbpi_order_nr] : undefined
    return computeDisplayStatus(order.status, items)
  }

  function openShipmentDialog(order: OrderWithItemCount) {
    const items = order.fbpi_order_nr ? itemsByOrder[order.fbpi_order_nr] : undefined
    const fulfillable = (items ?? []).filter((it) => canMarkOos(it))
    setShipmentTarget(order)
    setShipmentAwb("")
    setShipmentSelectedItems(new Set(fulfillable.map((it) => it.mp_item_nr)))
  }

  async function handleGetNoonAwb() {
    if (!shipmentTarget) return
    const countryCode = (
      shipmentTarget.customer_country_code ||
      "eg"
    ).trim().toLowerCase()

    setGeneratingAwb(true)
    const toastId = toast.loading("Generating AWB from Noon…")

    try {
      const result = await generateNoonAwb({ country_code: countryCode })
      if (!result.ok || !result.awb_nr) {
        toast.error(result.error || "Failed to generate AWB", { id: toastId })
        return
      }
      setShipmentAwb(result.awb_nr)
      toast.success(`AWB generated: ${result.awb_nr}`, { id: toastId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setGeneratingAwb(false)
    }
  }

  function toggleShipmentItem(mpItemNr: string) {
    setShipmentSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(mpItemNr)) {
        next.delete(mpItemNr)
      } else {
        next.add(mpItemNr)
      }
      return next
    })
  }

  async function handleConfirmCreateShipment() {
    if (!shipmentTarget || !shipmentTarget.fbpi_order_nr) return

    const warehouse = (shipmentTarget.warehouse_code ?? warehouseCode).trim()
    if (!warehouse) {
      toast.error("Warehouse code is required to create a shipment")
      return
    }

    const selectedItems = Array.from(shipmentSelectedItems)
    if (selectedItems.length === 0) {
      toast.error("Select at least one item to ship")
      return
    }

    setCreatingShipment(true)
    const toastId = toast.loading("Creating shipment on Noon…")

    try {
      const awbNr = shipmentAwb.trim()
      if (!awbNr) {
        toast.error("An AWB number is required. Click \"Get Noon AWB\" to generate one.", { id: toastId })
        return
      }

      const result = await createNoonShipment({
        warehouse_code: warehouse,
        fbpi_order_nr: shipmentTarget.fbpi_order_nr,
        items: selectedItems,
        awb_nr: awbNr,
      })

      if (!result.ok) {
        toast.error(result.error || "Failed to create shipment", { id: toastId })
        return
      }

      toast.success(
        `Shipment created (AWB: ${result.awb_nr ?? awbNr})`,
        { id: toastId }
      )

      // Update local state: mark shipped items and the order status.
      setItemsByOrder((prev) => {
        const list = prev[shipmentTarget.fbpi_order_nr as string]
        if (!list) return prev
        return {
          ...prev,
          [shipmentTarget.fbpi_order_nr as string]: list.map((it) =>
            selectedItems.includes(it.mp_item_nr)
              ? { ...it, integration_status: "SHIPPED" }
              : it
          ),
        }
      })

      setOrders((prev) =>
        prev.map((o) =>
          o.fbpi_order_nr === shipmentTarget.fbpi_order_nr
            ? {
                ...o,
                status: "SHIPPED",
                awb_nr: result.awb_nr ?? null,
                integration_shipment_nr: result.integration_shipment_nr ?? null,
              }
            : o
        )
      )

      setShipmentTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setCreatingShipment(false)
    }
  }

  async function handleConfirmMarkOos() {
    if (!oosTarget) return
    const { fbpi_order_nr, mp_item_nr } = oosTarget

    setMarkingOos(true)
    setOosItemNr(mp_item_nr)
    const toastId = toast.loading("Marking item as Out of Stock on Noon…")

    try {
      const result = await markItemOos({ fbpi_order_nr, mp_item_nr })

      if (!result.ok) {
        toast.error(result.error || "Failed to mark item as out of stock", { id: toastId })
        return
      }

      toast.success("Item marked as Out of Stock on Noon", { id: toastId })

      // Dynamically update the item's integration_status in local state
      // without reloading the page.
      setItemsByOrder((prev) => {
        const list = prev[fbpi_order_nr]
        if (!list) return prev
        return {
          ...prev,
          [fbpi_order_nr]: list.map((it) =>
            it.mp_item_nr === mp_item_nr
              ? { ...it, integration_status: "OUT_OF_STOCK" }
              : it
          ),
        }
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setMarkingOos(false)
      setOosItemNr(null)
      setOosTarget(null)
    }
  }

  function handlePrintLabel(order: OrderWithItemCount) {
    if (!order.awb_nr) return
    setLabelTarget(order)
  }

  function handlePrint() {
    window.print()
  }

  async function handleCancelShipment() {
    if (!cancelTarget) return
    if (!cancelTarget.warehouse_code || !cancelTarget.integration_shipment_nr) {
      toast.error("Missing warehouse code or shipment reference for this order.")
      setCancelTarget(null)
      return
    }

    setCancellingShipment(true)
    const toastId = toast.loading("Cancelling shipment on Noon…")
    try {
      const result = await cancelNoonShipment({
        warehouse_code: cancelTarget.warehouse_code,
        integration_shipment_nr: cancelTarget.integration_shipment_nr,
      })
      if (!result.ok) {
        toast.error(result.error || "Failed to cancel shipment", { id: toastId })
        return
      }
      toast.success("Shipment cancelled successfully", { id: toastId })

      setOrders((prev) =>
        prev.map((o) =>
          o.fbpi_order_nr === cancelTarget.fbpi_order_nr
            ? {
                ...o,
                status: "CANCELLED",
                awb_nr: null,
                integration_shipment_nr: null,
              }
            : o
        )
      )

      if (cancelTarget.fbpi_order_nr && itemsByOrder[cancelTarget.fbpi_order_nr]) {
        setItemsByOrder((prev) => ({
          ...prev,
          [cancelTarget.fbpi_order_nr as string]: prev[
            cancelTarget.fbpi_order_nr as string
          ].map((item) => ({
            ...item,
            integration_status: "CANCELLED",
          })),
        }))
      }

      setCancelTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setCancellingShipment(false)
    }
  }

  async function toggleRow(order: OrderWithItemCount) {
    const key = order.fbpi_order_nr ?? order.id
    if (expandedRow === key) {
      setExpandedRow(null)
      return
    }

    setExpandedRow(key)

    if (!order.fbpi_order_nr) return
    // Skip re-fetch only when items are already fully enriched (have product
    // name/image). Status-only seeds from load() lack enrichment, so we still
    // fetch + merge product details on first expand.
    const existing = itemsByOrder[order.fbpi_order_nr]
    if (existing && existing.some((it) => it.product_name !== null || it.product_image !== null)) {
      return
    }

    setLoadingItems(order.fbpi_order_nr)
    const { data, error } = await supabase
      .from("order_items")
      .select("mp_item_nr, fbpi_order_nr, partner_sku, mp_status, integration_status, price")
      .eq("fbpi_order_nr", order.fbpi_order_nr)
      .order("mp_item_nr")

    if (error) {
      toast.error("Failed to load order items: " + error.message)
      setLoadingItems(null)
      return
    }

    const rawItems = (data ?? []) as OrderItem[]

    // Frontend merge: fetch matching products by partner_sku in a separate
    // query (no relational join), then merge name + image into the items.
    const uniqueSkus = Array.from(
      new Set(
        rawItems
          .map((it) => it.partner_sku)
          .filter((s): s is string => typeof s === "string" && s.trim() !== "")
      )
    )

    const productMap = new Map<string, ProductInfo>()
    if (uniqueSkus.length > 0) {
      const { data: productRows, error: productError } = await supabase
        .from("products")
        .select("partner_sku, name, image_url")
        .in("partner_sku", uniqueSkus)

      if (!productError && productRows) {
        for (const row of productRows as { partner_sku: string; name: string | null; image_url: string | null }[]) {
          productMap.set(row.partner_sku, {
            name: row.name,
            image_url: row.image_url,
          })
        }
      }
    }

    const enriched: EnrichedOrderItem[] = rawItems.map((it) => {
      const info = it.partner_sku ? productMap.get(it.partner_sku) : undefined
      return {
        ...it,
        product_name: info?.name ?? null,
        product_image: info?.image_url ?? null,
      }
    })

    setItemsByOrder((prev) => ({
      ...prev,
      [order.fbpi_order_nr as string]: enriched,
    }))
    setLoadingItems(null)
  }

  function exportCsv() {
    if (orders.length === 0) {
      toast.error("No orders to export")
      return
    }

    const headers = ["Order Number", "MP Order Number", "Warehouse", "Created At", "Status", "Item Count", "Total Price"]
    const rows = orders.map((o) => [
      o.fbpi_order_nr ?? o.noon_order_id ?? "",
      o.mp_order_nr ?? "",
      o.warehouse_code ?? "",
      o.order_created_at ?? o.order_date ?? "",
      o.status ?? "",
      String(o.item_count),
      o.total_price != null ? String(o.total_price) : "",
    ])

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Orders exported")
  }

  // Compute the dynamic display status for every order upfront, using the
  // same line-items logic the table rows use (computeDisplayStatus). This
  // guarantees the tab counts and filtering match what's shown in the Status
  // column — e.g. an order whose stored status is "NEW" but whose items are
  // all cancelled/OOS shows as CANCELLED here too.
  const dynamicStatusByKey = new Map<string, string>()
  for (const o of orders) {
    const key = o.fbpi_order_nr ?? o.id
    const items = o.fbpi_order_nr ? itemsByOrder[o.fbpi_order_nr] : undefined
    dynamicStatusByKey.set(key, computeDisplayStatus(o.status, items))
  }

  // Bucket each order into one of the real-workflow tabs. Uses statusStyleKey
  // to normalize prefixes so SHIPPED, CANCELLED, OUT_OF_STOCK etc. all map to
  // the right category regardless of how Noon spelled the status.
  function orderTabBucket(order: OrderWithItemCount): string {
    const key = order.fbpi_order_nr ?? order.id
    const normalized = statusStyleKey(dynamicStatusByKey.get(key) ?? "NEW")
    if (normalized === "SHIPPED") return "shipped"
    if (CANCELLED_OR_OOS.includes(normalized)) return "cancelled"
    if (normalized === "RETURNED" || normalized === "REFUNDED") return "returned"
    return "new"
  }

  const statusCounts = {
    all: orders.length,
    new: orders.filter((o) => orderTabBucket(o) === "new").length,
    shipped: orders.filter((o) => orderTabBucket(o) === "shipped").length,
    cancelled: orders.filter((o) => orderTabBucket(o) === "cancelled").length,
    returned: orders.filter((o) => orderTabBucket(o) === "returned").length,
  }

  const tabs = [
    { label: "All Orders", value: "all", count: statusCounts.all },
    { label: "New", value: "new", count: statusCounts.new },
    { label: "Shipped", value: "shipped", count: statusCounts.shipped },
    { label: "Cancelled", value: "cancelled", count: statusCounts.cancelled },
    { label: "Returned", value: "returned", count: statusCounts.returned },
  ]

  const filtered = orders.filter((o) => {
    const matchesTab = activeTab === "all" || orderTabBucket(o) === activeTab
    const q = search.trim().toLowerCase()
    const matchesSearch =
      q === "" ||
      (o.fbpi_order_nr ?? "").toLowerCase().includes(q) ||
      (o.mp_order_nr ?? "").toLowerCase().includes(q) ||
      (o.warehouse_code ?? "").toLowerCase().includes(q)
    return matchesTab && matchesSearch
  })

  const totalRevenue = orders
    .filter((o) => isRevenueEligible(o.status))
    .reduce((sum, o) => {
      const items = o.fbpi_order_nr ? itemsByOrder[o.fbpi_order_nr] : undefined
      return sum + computeDisplayTotal(o.total_price, items)
    }, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6"><Skeleton className="h-8 w-20" /></CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-0">
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Orders</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orders.length} total orders · {statusCounts.new} new
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <ShoppingCart className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">Total Orders</CardTitle>
                <CardDescription className="text-xs">Synced from Noon</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums">{orders.length.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Boxes className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">Total Line Items</CardTitle>
                <CardDescription className="text-xs">Across all orders</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums">
              {orders.reduce((sum, o) => sum + o.item_count, 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Database className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">Total Revenue</CardTitle>
                <CardDescription className="text-xs">Confirmed & shipped orders</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums">
              {`${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sync Orders Form */}
      <Card>
        <CardHeader className="pb-4">
          <div>
            <CardTitle className="text-base">Sync Orders from Noon</CardTitle>
            <CardDescription className="mt-1">
              Pull all FBPI orders for a warehouse from the Noon API. Orders and
              their line items are saved to your dashboard automatically.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSyncOrders} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="warehouse-code">Warehouse Code</Label>
              <Input
                id="warehouse-code"
                placeholder="e.g. W00210108EG"
                value={warehouseCode}
                onChange={(e) => setWarehouseCode(e.target.value)}
                className="bg-background"
                disabled={syncing || creatingTestOrder}
              />
            </div>
            <Button type="submit" disabled={syncing || creatingTestOrder} className="gap-1.5 sm:w-auto">
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {syncing ? "Syncing…" : "Sync Orders"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={syncing || creatingTestOrder}
              onClick={handleCreateTestOrder}
              className="gap-1.5 sm:w-auto"
            >
              {creatingTestOrder ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wrench className="size-3.5" />
              )}
              {creatingTestOrder ? "Creating…" : "Create Test Order"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={syncing || creatingTestOrder || clearingTestOrders}
              onClick={() => setClearConfirmOpen(true)}
              className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 sm:w-auto"
            >
              {clearingTestOrders ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {clearingTestOrders ? "Clearing…" : "Clear Test Orders"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {orders.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="space-y-2">
            <Database className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No orders yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Enter your warehouse code above and click "Sync Orders" to pull
              live orders from the Noon FBPI API.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  activeTab === tab.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                    activeTab === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted-foreground/15 text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by order number or warehouse…"
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select defaultValue="all-time">
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-time">All time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This week</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="size-3.5" />
                Filter
              </Button>
            </div>
          </div>

          {/* Orders Table with expandable rows */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 pl-6"></TableHead>
                    <TableHead className="w-32">Order Number</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        No orders match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((order) => {
                      const key = order.fbpi_order_nr ?? order.id
                      const isOpen = expandedRow === key
                      const items = order.fbpi_order_nr ? itemsByOrder[order.fbpi_order_nr] : undefined
                      const isLoadingThis = loadingItems === order.fbpi_order_nr

                      return (
                        <React.Fragment key={key}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/30"
                            onClick={() => toggleRow(order)}
                          >
                            <TableCell className="pl-6">
                              <div className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent">
                                {isOpen ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm font-medium">
                              {order.fbpi_order_nr ?? order.noon_order_id ?? order.id.slice(0, 8)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {order.warehouse_code ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Warehouse className="size-3.5" />
                                  <span className="font-mono text-xs">{order.warehouse_code}</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {(order.order_created_at ?? order.order_date)
                                ? new Date(order.order_created_at ?? order.order_date ?? "").toLocaleString()
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {order.item_count}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {(() => {
                                const items = order.fbpi_order_nr ? itemsByOrder[order.fbpi_order_nr] : undefined
                                const total = computeDisplayTotal(order.total_price, items)
                                return total > 0 ? `${total.toFixed(2)}` : "—"
                              })()}
                            </TableCell>
                            <TableCell className="pr-6">
                              {(() => {
                                const dynStatus = displayOrderStatus(order)
                                return (
                                  <span
                                    className={cn(
                                      "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                      STATUS_STYLES[dynStatus] ??
                                        "bg-muted text-muted-foreground border-border"
                                    )}
                                  >
                                    {dynStatus}
                                  </span>
                                )
                              })()}
                            </TableCell>
                          </TableRow>

                          {isOpen && (
                            <TableRow key={`${key}-detail`} className="hover:bg-transparent">
                              <TableCell colSpan={7} className="bg-muted/20 px-6 py-4">
                                {isLoadingThis ? (
                                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" />
                                    Loading line items…
                                  </div>
                                ) : items && items.length > 0 ? (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Line Items ({items.length})
                                      </p>
                                      {isOrderFulfillable(order) && (
                                        <Button
                                          variant="default"
                                          size="sm"
                                          className="h-7 gap-1"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            openShipmentDialog(order)
                                          }}
                                        >
                                          <Truck className="size-3" />
                                          Fulfill Order
                                        </Button>
                                      )}
                                      {order.status === "SHIPPED" && order.awb_nr && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 gap-1"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handlePrintLabel(order)
                                          }}
                                        >
                                          <Printer className="size-3" />
                                          Print Label
                                        </Button>
                                      )}
                                      {order.status === "SHIPPED" && order.integration_shipment_nr && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                                          disabled={cancellingShipment && cancelTarget?.fbpi_order_nr === order.fbpi_order_nr}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setCancelTarget(order)
                                          }}
                                        >
                                          <Ban className="size-3" />
                                          Cancel Shipment
                                        </Button>
                                      )}
                                    </div>
                                    <div className="overflow-hidden rounded-lg border bg-background">
                                      <Table>
                                        <TableHeader>
                                          <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-4 w-16">Image</TableHead>
                                            <TableHead>Product</TableHead>
                                            <TableHead>MP Status</TableHead>
                                            <TableHead>Integration Status</TableHead>
                                            <TableHead className="pr-4 text-right">Price</TableHead>
                                            <TableHead className="pr-4 text-right">Action</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {items.map((item) => {
                                            const title = item.product_name || item.partner_sku || item.mp_item_nr
                                            return (
                                            <TableRow key={item.mp_item_nr} className="hover:bg-muted/30">
                                              <TableCell className="pl-4">
                                                <div
                                                  className={cn(
                                                    "flex size-10 items-center justify-center overflow-hidden rounded-md bg-muted",
                                                    item.product_image && "cursor-pointer hover:opacity-80"
                                                  )}
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (item.product_image) {
                                                      setLightboxImage({ url: item.product_image, title })
                                                    }
                                                  }}
                                                >
                                                  {item.product_image ? (
                                                    <img
                                                      src={item.product_image}
                                                      alt={title}
                                                      loading="lazy"
                                                      className="size-full object-cover"
                                                      onError={(e) => {
                                                        const t = e.currentTarget
                                                        t.style.display = "none"
                                                        const fb = t.nextElementSibling
                                                        if (fb) (fb as HTMLElement).style.display = "flex"
                                                      }}
                                                    />
                                                  ) : null}
                                                  <div
                                                    className="flex size-full items-center justify-center"
                                                    style={item.product_image ? { display: "none" } : undefined}
                                                  >
                                                    <ImageOff className="size-4 text-muted-foreground/50" />
                                                  </div>
                                                </div>
                                              </TableCell>
                                              <TableCell>
                                                <div className="flex flex-col gap-0.5">
                                                  <span className="text-sm font-medium leading-tight">{title}</span>
                                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                                    {item.partner_sku && (
                                                      <span className="font-mono">SKU: {item.partner_sku}</span>
                                                    )}
                                                    <span className="font-mono">#{item.mp_item_nr}</span>
                                                  </div>
                                                </div>
                                              </TableCell>
                                              <TableCell>
                                                <span
                                                  className={cn(
                                                    "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                                    statusBadgeClass(item.mp_status)
                                                  )}
                                                >
                                                  {formatItemStatus(item.mp_status)}
                                                </span>
                                              </TableCell>
                                              <TableCell>
                                                <span
                                                  className={cn(
                                                    "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                                    statusBadgeClass(item.integration_status)
                                                  )}
                                                >
                                                  {formatItemStatus(item.integration_status)}
                                                </span>
                                              </TableCell>
                                              <TableCell className="pr-4 text-right font-semibold tabular-nums">
                                                {item.price != null ? `${Number(item.price).toFixed(2)}` : "—"}
                                              </TableCell>
                                              <TableCell className="pr-4 text-right">
                                                {canMarkOos(item) ? (
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                                                    disabled={markingOos && oosItemNr === item.mp_item_nr}
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      setOosTarget({
                                                        fbpi_order_nr: item.fbpi_order_nr,
                                                        mp_item_nr: item.mp_item_nr,
                                                      })
                                                    }}
                                                  >
                                                    {markingOos && oosItemNr === item.mp_item_nr ? (
                                                      <Loader2 className="size-3 animate-spin" />
                                                    ) : (
                                                      <Ban className="size-3" />
                                                    )}
                                                    Mark OOS
                                                  </Button>
                                                ) : (
                                                  <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                            )
                                          })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="py-4 text-sm text-muted-foreground">
                                    No line items found for this order.
                                  </p>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>

            {/* Footer */}
            <div className="flex items-center justify-between border-t px-6 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {filtered.length} of {orders.length} orders
              </p>
              <p className="text-xs text-muted-foreground">
                Click a row to view line items
              </p>
            </div>
          </Card>
        </>
      )}

      {/* Print Label Dialog */}
      {labelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:static print:bg-transparent print:p-0">
          <div className="relative max-h-[90vh] overflow-auto bg-white p-4 print:overflow-visible print:p-0">
            <div className="mb-3 flex items-center justify-between print:hidden">
              <h2 className="text-lg font-semibold">Shipping Label Preview</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLabelTarget(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <ShippingLabel
              order={labelTarget}
              items={itemsByOrder[labelTarget.fbpi_order_nr ?? ""] ?? []}
            />
            <div className="mt-4 flex justify-end gap-2 print:hidden">
              <Button variant="outline" onClick={() => setLabelTarget(null)}>
                Close
              </Button>
              <Button onClick={handlePrint}>
                <Printer className="size-4" />
                Print
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Shipment Confirmation Dialog */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !cancellingShipment) {
            setCancelTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-600" />
              Cancel Shipment?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this shipment? This will cancel all
              items inside it on Noon and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingShipment}>Keep Shipment</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleCancelShipment()
              }}
              disabled={cancellingShipment}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
            >
              {cancellingShipment ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Yes, cancel shipment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark OOS Confirmation Dialog */}
      <AlertDialog
        open={oosTarget !== null}
        onOpenChange={(open) => {
          if (!open && !markingOos) {
            setOosTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-600" />
              Mark Item as Out of Stock?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this item as Out of Stock? This will
              cancel it on Noon's side and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingOos}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmMarkOos()
              }}
              disabled={markingOos}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
            >
              {markingOos ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Yes, mark as Out of Stock"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Test Orders Confirmation Dialog */}
      <AlertDialog
        open={clearConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !clearingTestOrders) {
            setClearConfirmOpen(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-600" />
              Clear Test Orders?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all orders whose order number starts
              with "TEST-" along with their associated line items. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingTestOrders}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleClearTestOrders()
              }}
              disabled={clearingTestOrders}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
            >
              {clearingTestOrders ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Yes, clear test orders"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Lightbox Dialog */}
      <Dialog
        open={lightboxImage !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxImage(null)
        }}
      >
        <DialogContent className="sm:max-w-md p-2">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm font-medium">{lightboxImage?.title}</DialogTitle>
          </DialogHeader>
          {lightboxImage && (
            <div className="flex items-center justify-center rounded-lg bg-muted/30 p-2">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Shipment Dialog */}
      <Dialog
        open={shipmentTarget !== null}
        onOpenChange={(open) => {
          if (!open && !creatingShipment) {
            setShipmentTarget(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="size-5" />
              Create Shipment
            </DialogTitle>
            <DialogDescription>
              Fulfill order{" "}
              <span className="font-mono font-medium">
                {shipmentTarget?.fbpi_order_nr}
              </span>{" "}
              via Noon. Select the items to ship, then click "Get Noon AWB" to
              generate a real tracking number before creating the shipment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Items selection */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Items to Ship
              </Label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                {(shipmentTarget?.fbpi_order_nr
                  ? itemsByOrder[shipmentTarget.fbpi_order_nr]
                  : [])?.map((item) => {
                    const fulfillable = canMarkOos(item)
                    const checked = shipmentSelectedItems.has(item.mp_item_nr)
                    return (
                      <label
                        key={item.mp_item_nr}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50",
                          !fulfillable && "cursor-not-allowed opacity-50 hover:bg-transparent"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!fulfillable}
                          onCheckedChange={() => toggleShipmentItem(item.mp_item_nr)}
                        />
                        <span className="flex-1 font-mono text-xs">
                          {item.mp_item_nr}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.integration_status ?? item.mp_status ?? "—"}
                        </span>
                      </label>
                    )
                  })}
                {(shipmentTarget?.fbpi_order_nr
                  ? itemsByOrder[shipmentTarget.fbpi_order_nr]
                  : [])?.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No items available.
                  </p>
                )}
              </div>
            </div>

            {/* AWB number input */}
            <div className="space-y-1.5">
              <Label htmlFor="awb-nr">
                AWB Number <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="awb-nr"
                  placeholder={'Click "Get Noon AWB" to generate'}
                  value={shipmentAwb}
                  onChange={(e) => setShipmentAwb(e.target.value)}
                  className="bg-background"
                  disabled={creatingShipment || generatingAwb}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={handleGetNoonAwb}
                  disabled={generatingAwb || creatingShipment}
                >
                  {generatingAwb ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  {generatingAwb ? "Generating…" : "Get Noon AWB"}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShipmentTarget(null)}
              disabled={creatingShipment}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreateShipment}
              disabled={creatingShipment || shipmentSelectedItems.size === 0 || !shipmentAwb.trim() || generatingAwb}
              className="gap-1.5"
            >
              {creatingShipment ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PackageCheck className="size-4" />
              )}
              {creatingShipment ? "Creating…" : "Create Shipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
