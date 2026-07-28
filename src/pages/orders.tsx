import React, { useCallback, useEffect, useState } from "react"
import { Search, Download, RefreshCw, Database, Loader as Loader2, ShoppingCart, Warehouse, ChevronRight, ChevronDown, Boxes, ListFilter as Filter, Ban, TriangleAlert as AlertTriangle, Truck, PackageCheck, Wrench, Printer } from "lucide-react"
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
import { syncNoonOrders, markItemOos, createNoonShipment, createNoonSandboxOrder, printNoonLabel } from "@/lib/noon"
import type { Order, OrderItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Fetched: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  Processing: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Shipped: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300",
  Pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Acknowledged: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Cancelled: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-300",
  Refunded: "bg-muted text-muted-foreground border-border",
}

type OrderWithItemCount = Order & { item_count: number; awb_nr: string | null }

export function OrdersPage() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [creatingTestOrder, setCreatingTestOrder] = useState(false)
  const [orders, setOrders] = useState<OrderWithItemCount[]>([])
  const [activeTab, setActiveTab] = useState("all")
  const [search, setSearch] = useState("")
  const [warehouseCode, setWarehouseCode] = useState("W00210108EG")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItem[]>>({})
  const [loadingItems, setLoadingItems] = useState<string | null>(null)
  const [oosTarget, setOosTarget] = useState<{ fbpi_order_nr: string; mp_item_nr: string } | null>(null)
  const [markingOos, setMarkingOos] = useState(false)
  const [oosItemNr, setOosItemNr] = useState<string | null>(null)
  const [shipmentTarget, setShipmentTarget] = useState<OrderWithItemCount | null>(null)
  const [shipmentAwb, setShipmentAwb] = useState("")
  const [shipmentSelectedItems, setShipmentSelectedItems] = useState<Set<string>>(new Set())
  const [creatingShipment, setCreatingShipment] = useState(false)
  const [printingLabel, setPrintingLabel] = useState<string | null>(null)

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
        awb_nr
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
      if (orderKeys.length > 0) {
        const { data: itemsData, error: itemsError } = await supabase
          .from("order_items")
          .select("fbpi_order_nr")
          .in("fbpi_order_nr", orderKeys)

        if (!itemsError && itemsData) {
          for (const it of itemsData as { fbpi_order_nr: string }[]) {
            countMap[it.fbpi_order_nr] = (countMap[it.fbpi_order_nr] ?? 0) + 1
          }
        }
      }

      const rows = (data ?? []).map((o) => ({
        ...(o as Order),
        item_count: countMap[o.fbpi_order_nr ?? ""] ?? 0,
        awb_nr: (o as { awb_nr?: string | null }).awb_nr ?? null,
      })) as OrderWithItemCount[]

      setOrders(rows)
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
    const integration = (item.integration_status ?? "").toUpperCase()
    const mp = (item.mp_status ?? "").toUpperCase()
    if (OOS_BLOCKED_STATUSES.has(integration)) return false
    if (OOS_BLOCKED_STATUSES.has(mp)) return false
    return true
  }

  // An order is fulfillable if it has at least one item that is not shipped,
  // cancelled, or out of stock.
  function isOrderFulfillable(order: OrderWithItemCount): boolean {
    const items = order.fbpi_order_nr ? itemsByOrder[order.fbpi_order_nr] : undefined
    if (!items || items.length === 0) return false
    return items.some((it) => canMarkOos(it))
  }

  function openShipmentDialog(order: OrderWithItemCount) {
    const items = order.fbpi_order_nr ? itemsByOrder[order.fbpi_order_nr] : undefined
    const fulfillable = (items ?? []).filter((it) => canMarkOos(it))
    setShipmentTarget(order)
    setShipmentAwb("")
    setShipmentSelectedItems(new Set(fulfillable.map((it) => it.mp_item_nr)))
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
      const result = await createNoonShipment({
        warehouse_code: warehouse,
        fbpi_order_nr: shipmentTarget.fbpi_order_nr,
        items: selectedItems,
        awb_nr: shipmentAwb.trim() || undefined,
      })

      if (!result.ok) {
        toast.error(result.error || "Failed to create shipment", { id: toastId })
        return
      }

      toast.success(
        `Shipment created (AWB: ${result.awb_nr ?? "auto"})`,
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
            ? { ...o, status: "SHIPPED", awb_nr: result.awb_nr ?? null }
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

  async function handlePrintLabel(order: OrderWithItemCount) {
    if (!order.fbpi_order_nr) return
    setPrintingLabel(order.fbpi_order_nr)
    const toastId = toast.loading("Fetching shipping label from Noon…")
    try {
      const result = await printNoonLabel(order.fbpi_order_nr, order.awb_nr ?? undefined)
      if (!result.ok) {
        toast.error(result.error || "Failed to fetch shipping label", { id: toastId })
        return
      }
      if (result.label_url) {
        window.open(result.label_url, "_blank", "noopener,noreferrer")
        toast.success("Shipping label opened in a new tab", { id: toastId })
      } else {
        toast.success("Label request sent to Noon", { id: toastId })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setPrintingLabel(null)
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
    if (itemsByOrder[order.fbpi_order_nr]) return // already loaded

    setLoadingItems(order.fbpi_order_nr)
    const { data, error } = await supabase
      .from("order_items")
      .select("mp_item_nr, fbpi_order_nr, partner_sku, mp_status, integration_status, price")
      .eq("fbpi_order_nr", order.fbpi_order_nr)
      .order("mp_item_nr")

    if (error) {
      toast.error("Failed to load order items: " + error.message)
    } else {
      setItemsByOrder((prev) => ({
        ...prev,
        [order.fbpi_order_nr as string]: (data ?? []) as OrderItem[],
      }))
    }
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

  const statusCounts = {
    all: orders.length,
    NEW: orders.filter((o) => (o.status ?? "NEW") === "NEW").length,
    Pending: orders.filter((o) => o.status === "Pending").length,
    Acknowledged: orders.filter((o) => o.status === "Acknowledged").length,
    Shipped: orders.filter((o) => o.status === "Shipped").length,
    Completed: orders.filter((o) => o.status === "Completed").length,
  }

  const tabs = [
    { label: "All Orders", value: "all", count: statusCounts.all },
    { label: "New", value: "NEW", count: statusCounts.NEW },
    { label: "Pending", value: "Pending", count: statusCounts.Pending },
    { label: "Acknowledged", value: "Acknowledged", count: statusCounts.Acknowledged },
    { label: "Shipped", value: "Shipped", count: statusCounts.Shipped },
    { label: "Completed", value: "Completed", count: statusCounts.Completed },
  ]

  const filtered = orders.filter((o) => {
    const matchesTab = activeTab === "all" || (o.status ?? "NEW") === activeTab
    const q = search.trim().toLowerCase()
    const matchesSearch =
      q === "" ||
      (o.fbpi_order_nr ?? "").toLowerCase().includes(q) ||
      (o.mp_order_nr ?? "").toLowerCase().includes(q) ||
      (o.warehouse_code ?? "").toLowerCase().includes(q)
    return matchesTab && matchesSearch
  })

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price ?? 0), 0)

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
            {orders.length} total orders · {statusCounts.NEW} new
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
                <CardDescription className="text-xs">Sum of all orders</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums">
              {totalRevenue > 0
                ? `$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "—"}
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
                              {order.total_price != null ? `$${Number(order.total_price).toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell className="pr-6">
                              <span
                                className={cn(
                                  "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                  STATUS_STYLES[order.status ?? "NEW"] ??
                                    "bg-muted text-muted-foreground border-border"
                                )}
                              >
                                {order.status ?? "NEW"}
                              </span>
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
                                          disabled={printingLabel === order.fbpi_order_nr}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handlePrintLabel(order)
                                          }}
                                        >
                                          {printingLabel === order.fbpi_order_nr ? (
                                            <Loader2 className="size-3 animate-spin" />
                                          ) : (
                                            <Printer className="size-3" />
                                          )}
                                          Print Label
                                        </Button>
                                      )}
                                    </div>
                                    <div className="overflow-hidden rounded-lg border bg-background">
                                      <Table>
                                        <TableHeader>
                                          <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-4">Item Number</TableHead>
                                            <TableHead>Partner SKU</TableHead>
                                            <TableHead>MP Status</TableHead>
                                            <TableHead>Integration Status</TableHead>
                                            <TableHead className="pr-4 text-right">Price</TableHead>
                                            <TableHead className="pr-4 text-right">Action</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {items.map((item) => (
                                            <TableRow key={item.mp_item_nr} className="hover:bg-muted/30">
                                              <TableCell className="pl-4 font-mono text-xs">
                                                {item.mp_item_nr}
                                              </TableCell>
                                              <TableCell className="font-mono text-xs">
                                                {item.partner_sku ?? "—"}
                                              </TableCell>
                                              <TableCell>
                                                <span className="text-xs">{item.mp_status ?? "—"}</span>
                                              </TableCell>
                                              <TableCell>
                                                <span className="text-xs">{item.integration_status ?? "—"}</span>
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
                                          ))}
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
              via Noon. Select the items to ship and enter an AWB number (optional
              — one will be auto-generated if left blank).
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
              <Label htmlFor="awb-nr">AWB Number (optional)</Label>
              <Input
                id="awb-nr"
                placeholder="Auto-generated if left blank"
                value={shipmentAwb}
                onChange={(e) => setShipmentAwb(e.target.value)}
                className="bg-background"
                disabled={creatingShipment}
              />
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
              disabled={creatingShipment || shipmentSelectedItems.size === 0}
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
