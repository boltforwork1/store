import { useEffect, useState } from "react"
import { Download, Package2, Warehouse, RefreshCw, Database, Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { supabase } from "@/lib/supabase"
import { updateNoonStock } from "@/lib/noon"
import { cn } from "@/lib/utils"

type InventoryRow = {
  id: string
  partner_sku: string
  name: string | null
  stock_qty: number | null
  price: number | null
  is_active: boolean | null
}

function getStockLevel(qty: number) {
  if (qty === 0) return { label: "Out of Stock", color: "text-red-600 dark:text-red-400" }
  if (qty < 10) return { label: "Low Stock", color: "text-amber-600 dark:text-amber-400" }
  return { label: "In Stock", color: "text-emerald-600 dark:text-emerald-400" }
}

export function InventoryPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<InventoryRow[]>([])
  const [updateOpen, setUpdateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ warehouseCode: "", partnerSku: "", qty: "" })

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

  function openUpdateForm(prefill?: Partial<InventoryRow>) {
    setForm({
      warehouseCode: "",
      partnerSku: prefill?.partner_sku ?? "",
      qty: prefill?.stock_qty != null ? String(prefill.stock_qty) : "",
    })
    setUpdateOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const warehouseCode = form.warehouseCode.trim()
    const partnerSku = form.partnerSku.trim()
    const qtyNum = Number(form.qty)

    if (!warehouseCode) {
      toast.error("Warehouse code is required")
      return
    }
    if (!partnerSku) {
      toast.error("Partner SKU is required")
      return
    }
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      toast.error("Quantity must be a non-negative number")
      return
    }

    setSubmitting(true)
    const toastId = toast.loading("Updating stock on Noon…")

    try {
      const result = await updateNoonStock([
        { warehouse_code: warehouseCode, partner_sku: partnerSku, qty: qtyNum },
      ])

      // Noon returns an `items` array; each item has a `status.status_code`.
      const data = (result.data ?? {}) as { items?: Array<{ status?: { status_code?: string; message?: string } }> }
      const responseItems = data.items ?? []
      const allOk = responseItems.length > 0 && responseItems.every(
        (it) => it.status?.status_code === "OK"
      )

      if (allOk) {
        toast.success(`Stock updated for ${partnerSku}`, { id: toastId })
        setUpdateOpen(false)
        await load()
      } else {
        // Partial or per-item failure: surface details from the first non-OK item.
        const failed = responseItems.find((it) => it.status?.status_code !== "OK")
        const detail = failed?.status?.message ?? "One or more items were not accepted by Noon"
        toast.error(detail, { id: toastId })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error(message, { id: toastId })
    } finally {
      setSubmitting(false)
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

  if (totalSkus === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Inventory Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time stock levels across all warehouses
          </p>
        </div>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Card className="max-w-md text-center">
            <CardContent className="space-y-4 pt-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Database className="size-6 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold">No inventory data yet</h3>
                <p className="text-sm text-muted-foreground">
                  Stock levels will populate automatically once you run a catalog
                  sync from the Noon Partner API.
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
            </CardContent>
          </Card>
        </div>
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
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="size-3.5" />
            Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openUpdateForm()}>
            <Pencil className="size-3.5" />
            Update Stock
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

      {/* Inventory Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Stock Levels</CardTitle>
          <CardDescription>All SKUs with current inventory</CardDescription>
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
                <TableHead className="pr-6 text-right">Action</TableHead>
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
                    <TableCell className="pr-6 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => openUpdateForm(item)}
                      >
                        <Pencil className="size-3" />
                        Update
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Update Stock Dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Stock</DialogTitle>
            <DialogDescription>
              Push a new stock level to Noon for a single SKU and warehouse.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="warehouse-code">Warehouse code</Label>
              <Input
                id="warehouse-code"
                placeholder="e.g. DXB-W01"
                value={form.warehouseCode}
                onChange={(e) => setForm((f) => ({ ...f, warehouseCode: e.target.value }))}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner-sku">Partner SKU</Label>
              <Input
                id="partner-sku"
                placeholder="e.g. SKU-12345"
                value={form.partnerSku}
                onChange={(e) => setForm((f) => ({ ...f, partnerSku: e.target.value }))}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 50"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                disabled={submitting}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUpdateOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="gap-1.5">
                {submitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Updating…
                  </>
                ) : (
                  "Update Stock"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
