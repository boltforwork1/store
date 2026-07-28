import { useEffect, useState } from "react"
import { Package2, Warehouse, RefreshCw, Search, Loader as Loader2, Check, X, PackageSearch, DatabaseZap } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { supabase } from "@/lib/supabase"
import { fetchNoonStock, updateNoonStock, syncNoonInventory } from "@/lib/noon"
import { cn } from "@/lib/utils"

type InventoryRow = {
  id: string
  partner_sku: string
  name: string | null
  stock_qty: number | null
  price: number | null
  is_active: boolean | null
}

type LookupResult = {
  warehouse_code: string
  partner_sku: string
  qty: number
  status_code: string
  message?: string
}

function getStockLevel(qty: number) {
  if (qty === 0) return { label: "Out of Stock", color: "text-red-600 dark:text-red-400" }
  if (qty < 10) return { label: "Low Stock", color: "text-amber-600 dark:text-amber-400" }
  return { label: "In Stock", color: "text-emerald-600 dark:text-emerald-400" }
}

export function InventoryPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<InventoryRow[]>([])

  // Lookup form state
  const [lookupWarehouse, setLookupWarehouse] = useState("")
  const [lookupSku, setLookupSku] = useState("")
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)

  // Quick update state (inline on a lookup result)
  const [newQty, setNewQty] = useState("")
  const [updating, setUpdating] = useState(false)

  // Bulk inventory sync state
  const [syncWarehouse, setSyncWarehouse] = useState("")
  const [syncing, setSyncing] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("products")
      .select("id, partner_sku, name, stock_qty, price, is_active")
      .order("partner_sku")

    if (error) {
      console.error("Failed to load inventory:", error.message)
    }
    setItems((data as InventoryRow[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const totalSkus = items.length
  const inStock = items.filter((i) => (i.stock_qty ?? 0) > 0).length
  const outOfStock = items.filter((i) => (i.stock_qty ?? 0) === 0).length
  const totalUnits = items.reduce((sum, i) => sum + (i.stock_qty ?? 0), 0)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()

    const warehouseCode = lookupWarehouse.trim()
    const partnerSku = lookupSku.trim()

    if (!warehouseCode) {
      toast.error("Warehouse code is required")
      return
    }
    if (!partnerSku) {
      toast.error("Partner SKU is required")
      return
    }

    setLookingUp(true)
    setLookupResult(null)
    const toastId = toast.loading("Fetching stock from Noon…")

    try {
      const result = await fetchNoonStock([
        { warehouse_code: warehouseCode, partner_sku: partnerSku },
      ])

      const data = (result.data ?? {}) as {
        items?: Array<{ warehouse_code?: string; partner_sku?: string; qty?: number; status?: { status_code?: string; message?: string } }>
      }
      const responseItems = data.items ?? []

      if (responseItems.length === 0) {
        toast.error("No stock data returned for that SKU", { id: toastId })
        return
      }

      const first = responseItems[0]
      const res: LookupResult = {
        warehouse_code: first.warehouse_code ?? warehouseCode,
        partner_sku: first.partner_sku ?? partnerSku,
        qty: Number(first.qty ?? 0),
        status_code: first.status?.status_code ?? "UNKNOWN",
        message: first.status?.message,
      }

      setLookupResult(res)
      setNewQty(String(res.qty))

      if (res.status_code === "OK") {
        toast.success(`Found ${res.qty} units for ${partnerSku}`, { id: toastId })
      } else {
        toast.warning(res.message ?? `Lookup returned status: ${res.status_code}`, { id: toastId })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error(message, { id: toastId })
    } finally {
      setLookingUp(false)
    }
  }

  async function handleQuickUpdate(e: React.FormEvent) {
    e.preventDefault()

    if (!lookupResult) return

    const qtyNum = Number(newQty)
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      toast.error("Quantity must be a non-negative number")
      return
    }

    setUpdating(true)
    const toastId = toast.loading("Updating stock on Noon…")

    try {
      const result = await updateNoonStock([
        {
          warehouse_code: lookupResult.warehouse_code,
          partner_sku: lookupResult.partner_sku,
          qty: qtyNum,
        },
      ])

      const data = (result.data ?? {}) as {
        items?: Array<{ status?: { status_code?: string; message?: string }; qty?: number }>
      }
      const responseItems = data.items ?? []
      const allOk = responseItems.length > 0 && responseItems.every(
        (it) => it.status?.status_code === "OK"
      )

      if (allOk) {
        toast.success(`Stock updated to ${qtyNum} for ${lookupResult.partner_sku}`, { id: toastId })
        setLookupResult((prev) => prev ? { ...prev, qty: qtyNum, status_code: "OK" } : prev)
        await load()
      } else {
        const failed = responseItems.find((it) => it.status?.status_code !== "OK")
        const detail = failed?.status?.message ?? "Noon did not accept the update"
        toast.error(detail, { id: toastId })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error(message, { id: toastId })
    } finally {
      setUpdating(false)
    }
  }

  function clearLookup() {
    setLookupWarehouse("")
    setLookupSku("")
    setLookupResult(null)
    setNewQty("")
  }

  async function handleSyncInventory(e: React.FormEvent) {
    e.preventDefault()

    const warehouseCode = syncWarehouse.trim()
    if (!warehouseCode) {
      toast.error("Warehouse code is required")
      return
    }

    setSyncing(true)
    const toastId = toast.loading(`Syncing inventory from Noon for warehouse ${warehouseCode}…`)

    try {
      const result = await syncNoonInventory({ warehouse_code: warehouseCode })

      if (!result.ok) {
        toast.error(result.error ?? "Failed to sync inventory", { id: toastId })
        return
      }

      const total = result.total_products ?? 0
      const synced = result.synced ?? 0
      toast.success(
        `Successfully synced inventory for ${total} products (${synced} stock levels retrieved from Noon)`,
        { id: toastId }
      )
      setSyncWarehouse("")
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error(message, { id: toastId })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Inventory Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time stock levels across all warehouses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Package2 className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">Total SKUs</CardTitle>
                <CardDescription className="text-xs">Synced products</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums">{totalSkus.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Warehouse className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">In Stock</CardTitle>
                <CardDescription className="text-xs">Available for sale</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{inStock.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Package2 className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">Out of Stock</CardTitle>
                <CardDescription className="text-xs">Requires attention</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{outOfStock.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Warehouse className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm">Total Units</CardTitle>
                <CardDescription className="text-xs">Across all SKUs</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold tabular-nums">{totalUnits.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Noon Inventory Sync (bulk) */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <DatabaseZap className="size-4 text-muted-foreground" />
            Noon Inventory Sync
          </CardTitle>
          <CardDescription>
            Pull real-time stock quantities from Noon for all your products at once. Enter the
            warehouse code (e.g. W00210108EG) and click Sync — every SKU will be updated with its
            live quantity and in-stock status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSyncInventory} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="sync-warehouse">Warehouse code</Label>
              <Input
                id="sync-warehouse"
                placeholder="e.g. W00210108EG"
                value={syncWarehouse}
                onChange={(e) => setSyncWarehouse(e.target.value)}
                disabled={syncing}
                required
                className="bg-background"
              />
            </div>
            <Button type="submit" disabled={syncing} className="gap-1.5 sm:w-auto">
              {syncing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  Sync Inventory
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Stock Lookup + Quick Update */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageSearch className="size-4 text-muted-foreground" />
            Stock Lookup
          </CardTitle>
          <CardDescription>
            Enter a warehouse code and SKU to fetch the live stock level from Noon, then update it inline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleLookup} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="lookup-warehouse">Warehouse code</Label>
              <Input
                id="lookup-warehouse"
                placeholder="e.g. DXB-W01"
                value={lookupWarehouse}
                onChange={(e) => setLookupWarehouse(e.target.value)}
                disabled={lookingUp}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lookup-sku">Partner SKU</Label>
              <Input
                id="lookup-sku"
                placeholder="e.g. SKU-12345"
                value={lookupSku}
                onChange={(e) => setLookupSku(e.target.value)}
                disabled={lookingUp}
                required
              />
            </div>
            <Button type="submit" disabled={lookingUp} className="gap-1.5">
              {lookingUp ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Search className="size-3.5" />
                  Lookup
                </>
              )}
            </Button>
          </form>

          {/* Lookup result + quick update */}
          {lookupResult && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{lookupResult.partner_sku}</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        lookupResult.status_code === "OK"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                      )}
                    >
                      {lookupResult.status_code}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Warehouse: <span className="font-mono">{lookupResult.warehouse_code}</span>
                    {" · "}Current qty: <span className="font-semibold tabular-nums">{lookupResult.qty}</span>
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={clearLookup}>
                  <X className="size-3" />
                  Clear
                </Button>
              </div>

              <form onSubmit={handleQuickUpdate} className="mt-4 flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="new-qty" className="text-xs">New quantity</Label>
                  <Input
                    id="new-qty"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 50"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    disabled={updating}
                    required
                    className="w-40"
                  />
                </div>
                <Button type="submit" disabled={updating} className="gap-1.5">
                  {updating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Updating…
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      Quick Update
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inventory Table */}
      {totalSkus === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="space-y-2">
            <PackageSearch className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No products yet</p>
            <p className="text-xs text-muted-foreground">
              Sync with the Noon catalog to populate your inventory list.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Stock Levels</CardTitle>
            <CardDescription>All SKUs with last-synced inventory</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const qty = item.stock_qty ?? 0
                  const level = getStockLevel(qty)
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                        {item.partner_sku}
                      </TableCell>
                      <TableCell className="font-medium max-w-[260px] truncate">
                        {item.name ?? item.partner_sku}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{qty}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {item.price != null ? `$${Number(item.price).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="pr-6">
                        <span className={cn("text-xs font-medium", level.color)}>
                          {level.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
