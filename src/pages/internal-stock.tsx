import { useCallback, useEffect, useRef, useState } from "react"
import {
  Plus,
  RefreshCw,
  Trash2,
  Loader as Loader2,
  Package,
  Upload,
  ImageOff,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
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
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type InventoryItem = {
  id: string
  product_name: string
  quantity: number
  cost_price: number
  image_url: string | null
  created_at: string
}

function fmtPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type StockLevel = {
  label: string
  className: string
  dot: string
}

function stockBadge(qty: number): StockLevel {
  if (qty <= 0) {
    return {
      label: "Out of stock",
      className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
      dot: "bg-red-500",
    }
  }
  if (qty <= 5) {
    return {
      label: "Low stock",
      className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
      dot: "bg-amber-500",
    }
  }
  if (qty <= 20) {
    return {
      label: "Medium stock",
      className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
      dot: "bg-blue-500",
    }
  }
  return {
    label: "In stock",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
    dot: "bg-emerald-500",
  }
}

export function InternalStockPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form fields
  const [formName, setFormName] = useState("")
  const [formQty, setFormQty] = useState("0")
  const [formCost, setFormCost] = useState("")
  const [formFile, setFormFile] = useState<File | null>(null)
  const [formPreview, setFormPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("internal_inventory")
      .select("id, product_name, quantity, cost_price, image_url, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Failed to load inventory: " + error.message)
      setItems([])
    } else {
      setItems((data ?? []) as InventoryItem[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function resetForm() {
    setFormName("")
    setFormQty("0")
    setFormCost("")
    setFormFile(null)
    setFormPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setFormFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setFormPreview(url)
    } else {
      setFormPreview(null)
    }
  }

  function clearFile() {
    setFormFile(null)
    setFormPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()

    const name = formName.trim()
    const qty = parseInt(formQty, 10)
    const cost = parseFloat(formCost)

    if (!name) { toast.error("Product name is required"); return }
    if (!Number.isFinite(qty) || qty < 0) { toast.error("Quantity must be 0 or more"); return }
    if (!Number.isFinite(cost) || cost < 0) { toast.error("Cost price must be a valid number"); return }

    setSaving(true)

    let imageUrl: string | null = null

    // Upload image to storage if a file was selected
    if (formFile) {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) {
        toast.error("You must be signed in to upload images")
        setSaving(false)
        return
      }

      const ext = formFile.name.split(".").pop()?.toLowerCase() ?? "jpg"
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("inventory_images")
        .upload(fileName, formFile, { contentType: formFile.type, upsert: false })

      if (uploadError) {
        toast.error("Image upload failed: " + uploadError.message)
        setSaving(false)
        return
      }

      const { data: pubData } = supabase.storage
        .from("inventory_images")
        .getPublicUrl(fileName)

      imageUrl = pubData.publicUrl
    }

    const { error } = await supabase.from("internal_inventory").insert({
      product_name: name,
      quantity: qty,
      cost_price: cost,
      image_url: imageUrl,
    })

    if (error) {
      toast.error("Failed to add product: " + error.message)
      setSaving(false)
      return
    }

    toast.success("Product added to internal inventory")
    resetForm()
    setAddOpen(false)
    setSaving(false)
    await load()
  }

  async function handleDeleteItem() {
    if (!deleteTarget) return
    setDeleting(true)

    // Delete the storage image if one exists
    if (deleteTarget.image_url) {
      try {
        const url = new URL(deleteTarget.image_url)
        const parts = url.pathname.split("/inventory_images/")
        if (parts.length === 2 && parts[1]) {
          const filePath = decodeURIComponent(parts[1])
          await supabase.storage.from("inventory_images").remove([filePath])
        }
      } catch {
        // URL parsing failed — not critical, continue with row deletion
      }
    }

    const { error } = await supabase
      .from("internal_inventory")
      .delete()
      .eq("id", deleteTarget.id)

    if (error) {
      toast.error("Failed to delete product: " + error.message)
      setDeleting(false)
      return
    }

    toast.success("Product deleted")
    setDeleteTarget(null)
    setDeleting(false)
    await load()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="aspect-square w-full rounded-b-none" />
              <CardContent className="pt-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Internal Stock</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manually track your own inventory — independent from Noon
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setAddOpen(true) }}>
            <Plus className="size-3.5" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:from-blue-950/40 dark:to-indigo-950/40">
            <p className="text-sm text-muted-foreground">Total Products</p>
            <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">{items.length}</p>
          </div>
          <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-teal-50 p-4 dark:from-emerald-950/40 dark:to-teal-950/40">
            <p className="text-sm text-muted-foreground">Total Units</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {items.reduce((s, i) => s + i.quantity, 0)}
            </p>
          </div>
          <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-orange-50 p-4 dark:from-amber-950/40 dark:to-orange-950/40">
            <p className="text-sm text-muted-foreground">Inventory Value</p>
            <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">
              {fmtPrice(items.reduce((s, i) => s + i.quantity * Number(i.cost_price), 0))}
            </p>
          </div>
        </div>
      )}

      {/* Product Grid */}
      {items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="space-y-2">
            <Package className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No products yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Click "Add Product" to create your first internal inventory item with an image.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const badge = stockBadge(item.quantity)
            return (
              <div
                key={item.id}
                className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:ring-2 hover:ring-primary/20"
              >
                {/* Image section */}
                <div className="relative aspect-square w-full overflow-hidden bg-muted">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.product_name}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        const t = e.currentTarget
                        t.style.display = "none"
                        const fb = t.nextElementSibling as HTMLElement | null
                        if (fb) fb.style.display = "flex"
                      }}
                    />
                  ) : null}
                  <div
                    className="flex size-full items-center justify-center"
                    style={item.image_url ? { display: "none" } : undefined}
                  >
                    <ImageOff className="size-10 text-muted-foreground/30" />
                  </div>
                  {/* Delete button overlay */}
                  <button
                    onClick={() => setDeleteTarget(item)}
                    className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 backdrop-blur-sm transition-all duration-200 hover:bg-red-500 group-hover:opacity-100"
                    aria-label="Delete product"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Content section */}
                <div className="space-y-3 p-4">
                  <div className="space-y-1">
                    <h3 className="line-clamp-1 font-bold leading-tight tracking-tight">
                      {item.product_name}
                    </h3>
                    <p className="text-lg font-extrabold tabular-nums text-foreground">
                      {fmtPrice(Number(item.cost_price))}
                    </p>
                  </div>

                  {/* Quantity badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Qty: <span className="font-bold tabular-nums text-foreground">{item.quantity}</span></span>
                    <span className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                      badge.className
                    )}>
                      <span className={cn("size-2 rounded-full", badge.dot)} />
                      {badge.label}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Product Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!saving) setAddOpen(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-5" />
              Add Product
            </DialogTitle>
            <DialogDescription>
              Create a new internal inventory item. The image is uploaded and stored automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4">
            {/* Image upload */}
            <div className="space-y-1.5">
              <Label>Product Image</Label>
              <div className="flex flex-col items-center">
                <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50">
                  {formPreview ? (
                    <>
                      <img src={formPreview} alt="Preview" className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={clearFile}
                        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-lg bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-red-500"
                        aria-label="Remove image"
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 py-6 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Upload className="size-8" />
                      <span className="text-sm font-medium">Click to upload an image</span>
                      <span className="text-xs">PNG, JPG up to ~5MB</span>
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {formPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change image
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Product Name <span className="text-destructive">*</span></Label>
              <Input
                id="inv-name"
                placeholder="e.g. Cotton T-Shirt"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-qty">Quantity <span className="text-destructive">*</span></Label>
                <Input
                  id="inv-qty"
                  type="number"
                  min={0}
                  step={1}
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-cost">Cost Price <span className="text-destructive">*</span></Label>
                <Input
                  id="inv-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={formCost}
                  onChange={(e) => setFormCost(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {saving ? "Saving…" : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!deleting) setDeleteTarget(open ? deleteTarget : null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove
              <span className="font-medium text-foreground"> {deleteTarget?.product_name}</span>
              and its image. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteItem() }}
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
