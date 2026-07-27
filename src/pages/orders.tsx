import { useEffect, useState } from "react"
import { Search, ListFilter as Filter, Download, Eye, MoveHorizontal as MoreHorizontal, ChevronLeft, ChevronRight, RefreshCw, Database, Loader as Loader2, ShoppingCart, Warehouse } from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { fetchNoonOrdersApi } from "@/lib/noon"
import { cn } from "@/lib/utils"

type OrderRow = {
  id: string
  noon_order_id: string | null
  order_date: string | null
  total_price: number | null
  status: string | null
  customer_country_code: string | null
}

const STATUS_STYLES: Record<string, string> = {
  Fetched: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  Processing: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Shipped: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300",
  Pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Acknowledged: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Cancelled: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-300",
  Refunded: "bg-muted text-muted-foreground border-border",
}

export function OrdersPage() {
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [activeTab, setActiveTab] = useState("all")
  const [search, setSearch] = useState("")

  // Fetch form state
  const [warehouseCode, setWarehouseCode] = useState("")

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("orders")
      .select("id, noon_order_id, order_date, total_price, status, customer_country_code")
      .order("order_date", { ascending: false })

    if (error) {
      console.error("Failed to load orders:", error.message)
    }
    setOrders((data as OrderRow[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleFetchOrders(e: React.FormEvent) {
    e.preventDefault()

    const warehouse = warehouseCode.trim()
    if (!warehouse) {
      toast.error("Warehouse code is required")
      return
    }

    setFetching(true)
    const toastId = toast.loading("Fetching live orders from Noon…")

    try {
      const result = await fetchNoonOrdersApi({ warehouse_code: warehouse })

      if (!result.ok) {
        toast.error(result.error ?? "Failed to fetch orders", { id: toastId })
        return
      }

      const count = result.count ?? result.orders?.length ?? 0
      toast.success(`Fetched ${count} order${count === 1 ? "" : "s"} from Noon`, {
        id: toastId,
      })
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error(message, { id: toastId })
    } finally {
      setFetching(false)
    }
  }

  const statusCounts = {
    all: orders.length,
    Pending: orders.filter((o) => o.status === "Pending").length,
    Acknowledged: orders.filter((o) => o.status === "Acknowledged").length,
    Shipped: orders.filter((o) => o.status === "Shipped").length,
    Completed: orders.filter((o) => o.status === "Completed").length,
    Fetched: orders.filter((o) => o.status === "Fetched").length,
  }

  const tabs = [
    { label: "All Orders", value: "all", count: statusCounts.all },
    { label: "Pending", value: "Pending", count: statusCounts.Pending },
    { label: "Acknowledged", value: "Acknowledged", count: statusCounts.Acknowledged },
    { label: "Shipped", value: "Shipped", count: statusCounts.Shipped },
    { label: "Completed", value: "Completed", count: statusCounts.Completed },
  ]

  const filtered = orders.filter((o) => {
    const matchesTab = activeTab === "all" || o.status === activeTab
    const q = search.trim().toLowerCase()
    const matchesSearch =
      q === "" ||
      (o.noon_order_id ?? "").toLowerCase().includes(q) ||
      (o.customer_country_code ?? "").toLowerCase().includes(q)
    return matchesTab && matchesSearch
  })

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price ?? 0), 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
            {orders.length} total orders · {statusCounts.Pending} pending
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
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
                <CardDescription className="text-xs">Fetched from Noon</CardDescription>
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
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Warehouse className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">Countries</CardTitle>
                <CardDescription className="text-xs">Unique customer countries</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums">
              {new Set(orders.map((o) => o.customer_country_code).filter(Boolean)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fetch Orders Form */}
      <Card>
        <CardHeader className="pb-4">
          <div>
            <CardTitle className="text-base">Fetch Orders from Noon</CardTitle>
            <CardDescription className="mt-1">
              Pull live orders from the Noon FBPI API using your warehouse code.
              Fetched orders are saved to your dashboard automatically.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFetchOrders} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="warehouse-code">Warehouse Code</Label>
              <Input
                id="warehouse-code"
                placeholder="e.g. EGYPT-01"
                value={warehouseCode}
                onChange={(e) => setWarehouseCode(e.target.value)}
                className="bg-background"
                disabled={fetching}
              />
            </div>
            <Button type="submit" disabled={fetching} className="gap-1.5 sm:w-auto">
              {fetching ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {fetching ? "Fetching…" : "Sync Orders"}
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
              Enter your warehouse code above and click "Sync Orders" to pull live
              orders from the Noon FBPI API.
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
                placeholder="Search by order ID or country…"
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

          {/* Orders Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6 w-20">Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-6 w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((order) => (
                    <TableRow key={order.id} className="hover:bg-muted/30">
                      <TableCell className="pl-6 font-mono text-sm font-medium">
                        {order.noon_order_id ?? order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {order.order_date ? new Date(order.order_date).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {order.total_price != null ? `$${Number(order.total_price).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.customer_country_code ? (
                          <span className="rounded-md border px-2 py-0.5 text-xs font-medium uppercase">
                            {order.customer_country_code}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            STATUS_STYLES[order.status ?? "Pending"] ??
                              "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {order.status ?? "Pending"}
                        </span>
                      </TableCell>
                      <TableCell className="pr-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-xs" className="rounded-md">
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="size-3.5 mr-2" />
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem>Mark as shipped</DropdownMenuItem>
                            <DropdownMenuItem>Print invoice</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive">
                              Cancel order
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t px-6 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {filtered.length} of {orders.length} orders
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-xs" disabled>
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="px-2 text-xs font-medium">1 / 1</span>
                <Button variant="ghost" size="icon-xs" disabled>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
