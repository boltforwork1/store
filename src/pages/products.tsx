import { useCallback, useEffect, useState } from "react"
import { Plus, Search, ListFilter as Filter, MoveHorizontal as MoreHorizontal, Package, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supabase } from "@/lib/supabase"
import { syncNoonCatalog, type SyncStage } from "@/lib/noon"
import type { Product } from "@/lib/types"

type DisplayProduct = {
  id: string
  name: string
  price: string
  stock: number
  status: string
}

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  "Low Stock": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  "Out of Stock": "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-300",
  Discontinued: "bg-muted text-muted-foreground border-border",
}

function deriveStatus(stock: number): string {
  if (stock <= 0) return "Out of Stock"
  if (stock < 15) return "Low Stock"
  return "Active"
}

function toDisplayProduct(row: Product): DisplayProduct {
  return {
    id: row.partner_sku,
    name: row.name ?? row.partner_sku,
    price: row.price != null ? `${Number(row.price).toFixed(2)}` : "—",
    stock: row.stock_qty ?? 0,
    status: row.is_active === false ? "Discontinued" : deriveStatus(row.stock_qty ?? 0),
  }
}

export function ProductsPage() {
  const [products, setProducts] = useState<DisplayProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [syncStage, setSyncStage] = useState<SyncStage | null>(null)
  const [syncMessage, setSyncMessage] = useState("")

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("products")
      .select("id, partner_sku, name, price, msrp, stock_qty, delivery_mode, is_active")
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Failed to load products: " + error.message)
      setProducts([])
    } else {
      setProducts((data ?? []).map(toDisplayProduct))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  async function handleSync() {
    setSyncStage("initializing")
    setSyncMessage("Initializing export…")

    const result = await syncNoonCatalog((progress) => {
      setSyncStage(progress.stage)
      setSyncMessage(progress.message)
    })

    if (result.ok) {
      toast.success(`Synced ${result.upserted ?? 0} products from Noon`)
      await loadProducts()
    } else {
      toast.error(result.error ?? "Sync failed")
    }

    setSyncStage(null)
    setSyncMessage("")
  }

  const isSyncing = syncStage !== null && syncStage !== "done"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Product Catalog</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Loading products…" : `${products.length} products across all categories`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="size-3.5" />
            Filter
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
            {isSyncing ? syncMessage : "Sync with Noon API"}
          </Button>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-3.5" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or SKU…"
          className="pl-9 bg-background"
        />
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="flex h-36 items-center justify-center bg-muted/50">
                <Package className="size-12 text-muted-foreground/30" />
              </div>
              <CardHeader className="pb-2 pt-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="mt-1 h-3 w-1/3 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="space-y-2">
            <Package className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No products yet</p>
            <p className="text-xs text-muted-foreground">
              Sync with the Noon API to import your catalog.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {products.map((product) => (
            <Card key={product.id} className="group relative overflow-hidden transition-shadow hover:shadow-md">
              {/* Product thumbnail placeholder */}
              <div className="flex h-36 items-center justify-center bg-muted/50">
                <Package className="size-12 text-muted-foreground/30" />
              </div>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{product.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground font-mono">{product.id}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Edit product</DropdownMenuItem>
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem>View analytics</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-1.5 mb-3">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium",
                      STATUS_STYLES[product.status]
                    )}
                  >
                    {product.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">{product.price}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {product.stock > 0 ? `${product.stock} in stock` : "No stock"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
