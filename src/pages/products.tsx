import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, Search, ListFilter as Filter, Package, Upload, FileSpreadsheet, Loader as Loader2, X, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { importCatalogFromFile, syncNoonCatalog } from "@/lib/noon"
import type { Product } from "@/lib/types"

type DisplayProduct = {
  id: string
  name: string
  price: string
  stock: number
  status: string
  image_url: string | null
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
    image_url: row.image_url ?? null,
  }
}

export function ProductsPage() {
  const [products, setProducts] = useState<DisplayProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [addSku, setAddSku] = useState("")
  const [addName, setAddName] = useState("")
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DisplayProduct | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("products")
      .select("id, partner_sku, name, price, msrp, stock_qty, delivery_mode, is_active, image_url")
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

  async function handleFile(file: File) {
    if (!file) return

    const allowed = [".csv", ".txt"]
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    if (!allowed.includes(ext)) {
      toast.error("Please upload a CSV file exported from the Noon Partner Portal.")
      return
    }

    setImporting(true)
    const toastId = toast.loading("Parsing catalog file…")

    const result = await importCatalogFromFile(file)

    if (result.ok) {
      toast.success(
        `Imported ${result.upserted ?? 0} products${result.skipped ? ` (${result.skipped} rows skipped)` : ""}`,
        { id: toastId }
      )
      await loadProducts()
    } else {
      toast.error(result.error ?? "Import failed", { id: toastId })
    }

    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault()
    const sku = addSku.trim()
    if (!sku) {
      toast.error("Partner SKU is required")
      return
    }

    setAdding(true)
    const { error } = await supabase.from("products").insert({
      partner_sku: sku,
      name: addName.trim() || null,
    })

    if (error) {
      toast.error("Failed to add product: " + error.message)
      setAdding(false)
      return
    }

    toast.success(`Product "${sku}" added successfully`)
    setAddSku("")
    setAddName("")
    setAddOpen(false)
    setAdding(false)
    await loadProducts()
  }

  async function handleDeleteProduct() {
    if (!deleteTarget) return
    setDeleting(true)

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("partner_sku", deleteTarget.id)

    if (error) {
      toast.error("Failed to delete product: " + error.message)
      setDeleting(false)
      return
    }

    toast.success("Product deleted successfully")
    setDeleteTarget(null)
    setDeleting(false)
    await loadProducts()
  }

  async function handleSyncCatalog() {
    setSyncing(true)
    const toastId = toast.loading("Syncing catalog details from Noon…")

    try {
      const result = await syncNoonCatalog({ limit: 30 })

      if (!result.ok) {
        toast.error(result.error ?? "Failed to sync catalog", { id: toastId })
        return
      }

      const synced = result.synced ?? 0
      const total = result.total_products ?? 0

      if (total === 0) {
        toast.info("All products already have catalog details — nothing to sync.", { id: toastId })
      } else {
        toast.success(`Successfully synced catalog data for ${synced} of ${total} products`, { id: toastId })
      }

      await loadProducts()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error(message, { id: toastId })
    } finally {
      setSyncing(false)
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(true)
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
  }

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase()
    if (q === "") return true
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    )
  })

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
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || syncing}
          >
            {importing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {importing ? "Importing…" : "Import CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleSyncCatalog}
            disabled={syncing || importing}
          >
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {syncing ? "Syncing…" : "Sync Catalog"}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setAddOpen(true)}
            disabled={adding || deleting}
          >
            <Plus className="size-3.5" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Hidden file input for programmatic clicks */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {/* Drag-and-drop import zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/20 hover:bg-muted/30"
        )}
      >
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !importing && !syncing && fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center transition-colors",
            !importing && "cursor-pointer"
          )}
        >
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
              dragging ? "bg-primary/10" : "bg-muted"
            )}
          >
            {importing ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <FileSpreadsheet
                className={cn(
                  "size-6 transition-colors",
                  dragging ? "text-primary" : "text-muted-foreground"
                )}
              />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {importing
                ? "Importing your catalog…"
                : dragging
                  ? "Drop your file to import"
                  : "Drag & drop your catalog CSV here"}
            </p>
            <p className="text-xs text-muted-foreground max-w-md">
              Export your catalog from the Noon Partner Portal (CSV) and upload
              the file here to sync your products.
            </p>
          </div>
          {!importing && !syncing && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              <Upload className="size-3.5" />
              Choose file
            </Button>
          )}
        </div>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or SKU…"
          className="pl-9 bg-background"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
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
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="space-y-2">
            <Package className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">
              {products.length === 0 ? "No products yet" : "No matching products"}
            </p>
            <p className="text-xs text-muted-foreground">
              {products.length === 0
                ? "Import a CSV from the Noon Partner Portal to populate your catalog."
                : "Try a different search term."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((product) => (
            <Card key={product.id} className="group relative overflow-hidden transition-shadow hover:shadow-md">
              {/* Product thumbnail */}
              <div className="relative h-36 w-full overflow-hidden bg-muted/50">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      const target = e.currentTarget
                      target.style.display = "none"
                      const fallback = target.nextElementSibling
                      if (fallback) (fallback as HTMLElement).style.display = "flex"
                    }}
                  />
                ) : null}
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={product.image_url ? { display: "none" } : undefined}
                >
                  <Package className="size-12 text-muted-foreground/30" />
                </div>
              </div>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{product.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground font-mono">{product.id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(product)
                    }}
                    aria-label={`Delete ${product.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
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
      {/* Add Product Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!adding) setAddOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>
              Add a new product to your catalog. You can sync its details from Noon later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="partner-sku">Partner SKU <span className="text-destructive">*</span></Label>
              <Input
                id="partner-sku"
                placeholder="e.g. NOON-SKU-12345"
                value={addSku}
                onChange={(e) => setAddSku(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-name">Product Name</Label>
              <Input
                id="product-name"
                placeholder="Optional — will be fetched from Noon on sync"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adding}>
                {adding ? <Loader2 className="size-4 animate-spin" /> : null}
                {adding ? "Adding…" : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!deleting) setDeleteTarget(open ? deleteTarget : null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium text-foreground">{deleteTarget?.name}</span>
              (SKU: {deleteTarget?.id}) from your catalog. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteProduct() }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
