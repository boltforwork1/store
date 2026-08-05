import { useEffect, useState } from "react"
import { Package2, Warehouse, RefreshCw, Search, Loader as Loader2, Check, X, PackageSearch, DatabaseZap, Tags } from "lucide-react"
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
import { fetchNoonStock, updateNoonStock, syncNoonInventory, syncNoonPricing } from "@/lib/noon"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/language-provider"

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

function getStockLevel(qty: number, t: (en: string, ar: string) => string) {
  if (qty === 0) return { label: t("Out of Stock", "نفد من المخزون"), color: "text-red-600 dark:text-red-400" }
  if (qty < 10) return { label: t("Low Stock", "مخزون منخفض"), color: "text-amber-600 dark:text-amber-400" }
  return { label: t("In Stock", "متوفر في المخزون"), color: "text-emerald-600 dark:text-emerald-400" }
}

export function InventoryPage() {
  const { t } = useLanguage()
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

  // Bulk pricing sync state
  const [syncCountry, setSyncCountry] = useState("eg")
  const [syncingPrices, setSyncingPrices] = useState(false)

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
      toast.error(t("Warehouse code is required", "كود المستودع مطلوب"))
      return
    }
    if (!partnerSku) {
      toast.error(t("Partner SKU is required", "رمز SKU للشريك مطلوب"))
      return
    }

    setLookingUp(true)
    setLookupResult(null)
    const toastId = toast.loading(t("Fetching stock from Noon…", "جارٍ جلب المخزون من نون…"))

    try {
      const result = await fetchNoonStock([
        { warehouse_code: warehouseCode, partner_sku: partnerSku },
      ])

      const data = (result.data ?? {}) as {
        items?: Array<{ warehouse_code?: string; partner_sku?: string; qty?: number; status?: { status_code?: string; message?: string } }>
      }
      const responseItems = data.items ?? []

      if (responseItems.length === 0) {
        toast.error(t("No stock data returned for that SKU", "لا توجد بيانات مخزون لهذا الرمز"), { id: toastId })
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
        toast.success(t(`Found ${res.qty} units for ${partnerSku}`, `تم العثور على ${res.qty} وحدة لـ ${partnerSku}`), { id: toastId })
      } else {
        toast.warning(res.message ?? t(`Lookup returned status: ${res.status_code}`, `أعاد البحث الحالة: ${res.status_code}`), { id: toastId })
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
      toast.error(t("Quantity must be a non-negative number", "يجب أن تكون الكمية رقمًا غير سالب"))
      return
    }

    setUpdating(true)
    const toastId = toast.loading(t("Updating stock on Noon…", "جارٍ تحديث المخزون على نون…"))

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
        toast.success(t(`Stock updated to ${qtyNum} for ${lookupResult.partner_sku}`, `تم تحديث المخزون إلى ${qtyNum} لـ ${lookupResult.partner_sku}`), { id: toastId })
        setLookupResult((prev) => prev ? { ...prev, qty: qtyNum, status_code: "OK" } : prev)
        await load()
      } else {
        const failed = responseItems.find((it) => it.status?.status_code !== "OK")
        const detail = failed?.status?.message ?? t("Noon did not accept the update", "لم يقبل نون التحديث")
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

  async function handleSyncPricing(e: React.FormEvent) {
    e.preventDefault()

    const countryCode = syncCountry.trim().toLowerCase()
    if (!countryCode) {
      toast.error(t("Country code is required", "كود الدولة مطلوب"))
      return
    }

    setSyncingPrices(true)
    const toastId = toast.loading(t(`Syncing prices from Noon for country ${countryCode.toUpperCase()}…`, `جارٍ مزامنة الأسعار من نون للدولة ${countryCode.toUpperCase()}…`))

    try {
      const result = await syncNoonPricing({ country_code: countryCode })

      if (!result.ok) {
        toast.error(result.error ?? t("Failed to sync prices", "فشل في مزامنة الأسعار"), { id: toastId })
        return
      }

      const total = result.total_products ?? 0
      const synced = result.synced ?? 0
      toast.success(
        t(`Successfully synced prices for ${total} products (${synced} prices retrieved from Noon)`, `تمت مزامنة الأسعار لـ ${total} منتج (${synced} سعر تم استرجاعه من نون)`),
        { id: toastId }
      )
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error(message, { id: toastId })
    } finally {
      setSyncingPrices(false)
    }
  }

  async function handleSyncInventory(e: React.FormEvent) {
    e.preventDefault()

    const warehouseCode = syncWarehouse.trim()
    if (!warehouseCode) {
      toast.error(t("Warehouse code is required", "كود المستودع مطلوب"))
      return
    }

    setSyncing(true)
    const toastId = toast.loading(t(`Syncing inventory from Noon for warehouse ${warehouseCode}…`, `جارٍ مزامنة المخزون من نون للمستودع ${warehouseCode}…`))

    try {
      const result = await syncNoonInventory({ warehouse_code: warehouseCode })

      if (!result.ok) {
        toast.error(result.error ?? t("Failed to sync inventory", "فشل في مزامنة المخزون"), { id: toastId })
        return
      }

      const total = result.total_products ?? 0
      const synced = result.synced ?? 0
      toast.success(
        t(`Successfully synced inventory for ${total} products (${synced} stock levels retrieved from Noon)`, `تمت مزامنة المخزون لـ ${total} منتج (${synced} مستوى مخزون تم استرجاعه من نون)`),
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
          <h2 className="text-xl font-semibold tracking-tight">{t("Inventory Management", "إدارة المخزون")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("Real-time stock levels across all warehouses", "مستويات المخزون في الوقت الفعلي عبر جميع المستودعات")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="size-3.5" />
            {t("Refresh", "تحديث")}
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
                <CardTitle className="text-sm">{t("Total SKUs", "إجمالي رموز SKU")}</CardTitle>
                <CardDescription className="text-xs">{t("Synced products", "المنتجات المتزامنة")}</CardDescription>
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
                <CardTitle className="text-sm">{t("In Stock", "متوفر في المخزون")}</CardTitle>
                <CardDescription className="text-xs">{t("Available for sale", "متاح للبيع")}</CardDescription>
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
                <CardTitle className="text-sm">{t("Out of Stock", "نفد من المخزون")}</CardTitle>
                <CardDescription className="text-xs">{t("Requires attention", "يتطلب الانتباه")}</CardDescription>
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
                <CardTitle className="text-sm">{t("Total Units", "إجمالي الوحدات")}</CardTitle>
                <CardDescription className="text-xs">{t("Across all SKUs", "عبر جميع رموز SKU")}</CardDescription>
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
            {t("Noon Inventory Sync", "مزامنة مخزون نون")}
          </CardTitle>
          <CardDescription>
            {t("Pull real-time stock quantities from Noon for all your products at once. Enter the warehouse code (e.g. W00210108EG) and click Sync — every SKU will be updated with its live quantity and in-stock status.", "اسحب كميات المخزون في الوقت الفعلي من نون لجميع منتجاتك دفعة واحدة. أدخل كود المستودع (مثال W00210108EG) واضغط مزامنة — سيتم تحديث كل رمز SKU بكميته المباشرة وحالة التوفر.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSyncInventory} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="sync-warehouse">{t("Warehouse code", "كود المستودع")}</Label>
              <Input
                id="sync-warehouse"
                placeholder={t("e.g. W00210108EG", "مثال W00210108EG")}
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
                  {t("Syncing…", "جارٍ المزامنة…")}
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  {t("Sync Inventory", "مزامنة المخزون")}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Noon Pricing Sync (bulk) */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Tags className="size-4 text-muted-foreground" />
            {t("Noon Pricing Sync", "مزامنة أسعار نون")}
          </CardTitle>
          <CardDescription>
            {t("Pull live prices from Noon for all your products at once. Enter the country code (e.g. eg, sa, ae) and click Sync Prices — every SKU will be updated with its current selling price from Noon.", "اسحب الأسعار المباشرة من نون لجميع منتجاتك دفعة واحدة. أدخل كود الدولة (مثال eg, sa, ae) واضغط مزامنة الأسعار — سيتم تحديث كل رمز SKU بسعر البيع الحالي من نون.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSyncPricing} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="sync-country">{t("Country code", "كود الدولة")}</Label>
              <Input
                id="sync-country"
                placeholder={t("e.g. eg", "مثال eg")}
                value={syncCountry}
                onChange={(e) => setSyncCountry(e.target.value)}
                disabled={syncingPrices}
                required
                className="bg-background"
              />
            </div>
            <Button type="submit" disabled={syncingPrices} className="gap-1.5 sm:w-auto">
              {syncingPrices ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("Syncing…", "جارٍ المزامنة…")}
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  {t("Sync Prices", "مزامنة الأسعار")}
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
            {t("Stock Lookup", "البحث في المخزون")}
          </CardTitle>
          <CardDescription>
            {t("Enter a warehouse code and SKU to fetch the live stock level from Noon, then update it inline.", "أدخل كود المستودع ورمز SKU لجلب مستوى المخزون المباشر من نون، ثم قم بتحديثه مباشرة.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleLookup} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="lookup-warehouse">{t("Warehouse code", "كود المستودع")}</Label>
              <Input
                id="lookup-warehouse"
                placeholder={t("e.g. DXB-W01", "مثال DXB-W01")}
                value={lookupWarehouse}
                onChange={(e) => setLookupWarehouse(e.target.value)}
                disabled={lookingUp}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lookup-sku">{t("Partner SKU", "رمز SKU للشريك")}</Label>
              <Input
                id="lookup-sku"
                placeholder={t("e.g. SKU-12345", "مثال SKU-12345")}
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
                  {t("Searching…", "جارٍ البحث…")}
                </>
              ) : (
                <>
                  <Search className="size-3.5" />
                  {t("Lookup", "بحث")}
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
                    {t("Warehouse", "المستودع")}: <span className="font-mono">{lookupResult.warehouse_code}</span>
                    {" · "}{t("Current qty", "الكمية الحالية")}: <span className="font-semibold tabular-nums">{lookupResult.qty}</span>
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={clearLookup}>
                  <X className="size-3" />
                  {t("Clear", "مسح")}
                </Button>
              </div>

              <form onSubmit={handleQuickUpdate} className="mt-4 flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="new-qty" className="text-xs">{t("New quantity", "الكمية الجديدة")}</Label>
                  <Input
                    id="new-qty"
                    type="number"
                    min={0}
                    step={1}
                    placeholder={t("e.g. 50", "مثال 50")}
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
                      {t("Updating…", "جارٍ التحديث…")}
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      {t("Quick Update", "تحديث سريع")}
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
            <p className="text-sm font-medium">{t("No products yet", "لا توجد منتجات بعد")}</p>
            <p className="text-xs text-muted-foreground">
              {t("Sync with the Noon catalog to populate your inventory list.", "قم بالمزامنة مع كتالوج نون لتعبئة قائمة المخزون الخاصة بك.")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">{t("Stock Levels", "مستويات المخزون")}</CardTitle>
            <CardDescription>{t("All SKUs with last-synced inventory", "جميع رموز SKU مع آخر مخزون متزامن")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-6 text-start">{t("SKU", "رمز SKU")}</TableHead>
                  <TableHead className="text-start">{t("Product", "المنتج")}</TableHead>
                  <TableHead className="text-end">{t("Qty", "الكمية")}</TableHead>
                  <TableHead className="text-end">{t("Price", "السعر")}</TableHead>
                  <TableHead className="pe-6 text-start">{t("Status", "الحالة")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const qty = item.stock_qty ?? 0
                  const level = getStockLevel(qty, t)
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="ps-6 font-mono text-xs text-muted-foreground text-start">
                        {item.partner_sku}
                      </TableCell>
                      <TableCell className="font-medium max-w-[260px] truncate text-start">
                        {item.name ?? item.partner_sku}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">{qty}</TableCell>
                      <TableCell className="text-end font-medium tabular-nums">
                        {item.price != null ? `${Number(item.price).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="pe-6 text-start">
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
