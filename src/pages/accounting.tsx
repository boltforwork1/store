import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Loader as Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Coins,
  ChevronLeft,
  ChevronRight,
  Search,
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
import { useLanguage } from "@/components/language-provider"
import { ProductNameAutocomplete } from "@/components/product-name-autocomplete"
import { DocumentNumberAutocomplete } from "@/components/document-number-autocomplete"

type FinanceRecord = {
  id: string
  date: string
  sku: string
  product_name: string
  quantity: number
  cost_price: number
  selling_price: number
  document_number: string | null
  created_at: string
}

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const MONTH_NAMES_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

function netProfit(r: { selling_price: number; cost_price: number; quantity: number }): number {
  return (Number(r.selling_price) - Number(r.cost_price)) * Number(r.quantity)
}

function revenue(r: { selling_price: number; quantity: number }): number {
  return Number(r.selling_price) * Number(r.quantity)
}

function totalCost(r: { cost_price: number; quantity: number }): number {
  return Number(r.cost_price) * Number(r.quantity)
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function AccountingPage() {
  const { t, lang } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<FinanceRecord[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FinanceRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FinanceRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Month/year filter — defaults to current month
  const now = new Date()
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState(now.getMonth())
  const [search, setSearch] = useState("")
  const [inventoryNames, setInventoryNames] = useState<string[]>([])
  const [documentNumbers, setDocumentNumbers] = useState<string[]>([])

  // Add-record form fields
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formSku, setFormSku] = useState("")
  const [formName, setFormName] = useState("")
  const [formQty, setFormQty] = useState("1")
  const [formCost, setFormCost] = useState("")
  const [formSelling, setFormSelling] = useState("")
  const [formDocNumber, setFormDocNumber] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("finance_records")
      .select("id, date, sku, product_name, quantity, cost_price, selling_price, document_number, created_at")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      toast.error(t("Failed to load finance records", "فشل تحميل السجلات المالية") + ": " + error.message)
      setRecords([])
    } else {
      setRecords((data ?? []) as FinanceRecord[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Fetch product names from internal_inventory for autocomplete suggestions
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("internal_inventory")
        .select("product_name")
        .order("product_name", { ascending: true })
      if (!error && data) {
        const names = data.map((r: { product_name: string }) => r.product_name).filter(Boolean)
        setInventoryNames(Array.from(new Set(names)))
      }
    })()
  }, [])

  // Fetch document numbers from documents table for autocomplete suggestions
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("document_number")
        .order("document_number", { ascending: true })
      if (!error && data) {
        const numbers = data.map((r: { document_number: string }) => r.document_number).filter(Boolean)
        setDocumentNumbers(Array.from(new Set(numbers)))
      }
    })()
  }, [])

  // Filter records to the selected month/year
  const monthlyRecords = useMemo(() => {
    return records.filter((r) => {
      const d = new Date(r.date)
      return d.getFullYear() === filterYear && d.getMonth() === filterMonth
    })
  }, [records, filterYear, filterMonth])

  // Apply the search query on top of the month filter
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q === "") return monthlyRecords
    return monthlyRecords.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        (r.document_number ?? "").toLowerCase().includes(q)
    )
  }, [monthlyRecords, search])

  const kpis = useMemo(() => {
    let totalProfit = 0
    let totalRevenue = 0
    let totalCostVal = 0
    let positiveCount = 0
    let negativeCount = 0

    for (const r of filteredRecords) {
      const np = netProfit(r)
      totalProfit += np
      totalRevenue += revenue(r)
      totalCostVal += totalCost(r)
      if (np >= 0) positiveCount++
      else negativeCount++
    }

    return {
      totalProfit,
      totalRevenue,
      totalCost: totalCostVal,
      profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      recordCount: filteredRecords.length,
      positiveCount,
      negativeCount,
    }
  }, [filteredRecords])

  function goToPrevMonth() {
    if (filterMonth === 0) {
      setFilterMonth(11)
      setFilterYear((y) => y - 1)
    } else {
      setFilterMonth((m) => m - 1)
    }
  }

  function goToNextMonth() {
    if (filterMonth === 11) {
      setFilterMonth(0)
      setFilterYear((y) => y + 1)
    } else {
      setFilterMonth((m) => m + 1)
    }
  }

  function resetForm() {
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormSku("")
    setFormName("")
    setFormQty("1")
    setFormCost("")
    setFormSelling("")
    setFormDocNumber("")
  }

  function populateForm(record: FinanceRecord) {
    setFormDate(record.date)
    setFormSku(record.sku)
    setFormName(record.product_name)
    setFormQty(String(record.quantity))
    setFormCost(String(record.cost_price))
    setFormSelling(String(record.selling_price))
    setFormDocNumber(record.document_number ?? "")
  }

  function openAddForm() {
    setEditTarget(null)
    resetForm()
    setFormOpen(true)
  }

  function openEditForm(record: FinanceRecord) {
    setEditTarget(record)
    populateForm(record)
    setFormOpen(true)
  }

  async function handleSubmitRecord(e: React.FormEvent) {
    e.preventDefault()

    const sku = formSku.trim()
    const name = formName.trim()
    const qty = parseInt(formQty, 10)
    const cost = parseFloat(formCost)
    const selling = parseFloat(formSelling)
    const docNumber = formDocNumber.trim()

    if (!sku) { toast.error(t("SKU is required", "رمز SKU مطلوب")); return }
    if (!name) { toast.error(t("Product name is required", "اسم المنتج مطلوب")); return }
    if (!Number.isFinite(qty) || qty < 1) { toast.error(t("Quantity must be at least 1", "يجب أن تكون الكمية 1 على الأقل")); return }
    if (!Number.isFinite(cost) || cost < 0) { toast.error(t("Cost price must be a valid number", "يجب أن يكون سعر التكلفة رقماً صالحاً")); return }
    if (!Number.isFinite(selling) || selling < 0) { toast.error(t("Selling price must be a valid number", "يجب أن يكون سعر البيع رقماً صالحاً")); return }

    setSaving(true)

    if (editTarget) {
      const { error } = await supabase
        .from("finance_records")
        .update({
          date: formDate,
          sku,
          product_name: name,
          quantity: qty,
          cost_price: cost,
          selling_price: selling,
          document_number: docNumber || null,
        })
        .eq("id", editTarget.id)

      if (error) {
        toast.error(t("Failed to update record", "فشل تحديث السجل") + ": " + error.message)
        setSaving(false)
        return
      }

      toast.success(t("Finance record updated", "تم تحديث السجل المالي"))
    } else {
      const { error } = await supabase.from("finance_records").insert({
        date: formDate,
        sku,
        product_name: name,
        quantity: qty,
        cost_price: cost,
        selling_price: selling,
        document_number: docNumber || null,
      })

      if (error) {
        toast.error(t("Failed to add record", "فشل إضافة السجل") + ": " + error.message)
        setSaving(false)
        return
      }

      toast.success(t("Finance record added", "تم إضافة السجل المالي"))
    }

    resetForm()
    setFormOpen(false)
    setEditTarget(null)
    setSaving(false)
    await load()
  }

  async function handleDeleteRecord() {
    if (!deleteTarget) return
    setDeleting(true)

    const { error } = await supabase
      .from("finance_records")
      .delete()
      .eq("id", deleteTarget.id)

    if (error) {
      toast.error(t("Failed to delete record", "فشل حذف السجل") + ": " + error.message)
      setDeleting(false)
      return
    }

    toast.success(t("Record deleted", "تم حذف السجل"))
    setDeleteTarget(null)
    setDeleting(false)
    await load()
  }

  const monthLabel = `${lang === "ar" ? MONTH_NAMES_AR[filterMonth] : MONTH_NAMES_EN[filterMonth]} ${filterYear}`

  // KPI card color schemes — lively, distinct colors per card
  const kpiCards = [
    {
      label: t("Net Profit", "صافي الربح"),
      value: kpis.totalProfit,
      display: fmt(kpis.totalProfit),
      icon: Wallet,
      gradient: "from-emerald-500 to-teal-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      text: kpis.totalProfit >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400",
      suffix: kpis.totalProfit >= 0 ? t("profit", "ربح") : t("loss", "خسارة"),
    },
    {
      label: t("Total Revenue", "إجمالي الإيرادات"),
      value: kpis.totalRevenue,
      display: fmt(kpis.totalRevenue),
      icon: Coins,
      gradient: "from-blue-500 to-indigo-600",
      bg: "bg-blue-50 dark:bg-blue-950/40",
      text: "text-blue-700 dark:text-blue-300",
      suffix: t("sales", "مبيعات"),
    },
    {
      label: t("Total Cost", "إجمالي التكلفة"),
      value: kpis.totalCost,
      display: fmt(kpis.totalCost),
      icon: Receipt,
      gradient: "from-amber-500 to-orange-600",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      text: "text-amber-700 dark:text-amber-300",
      suffix: t("expenses", "مصروفات"),
    },
    {
      label: t("Profit Margin", "هامش الربح"),
      value: kpis.profitMargin,
      display: `${kpis.profitMargin.toFixed(1)}%`,
      icon: kpis.profitMargin >= 0 ? TrendingUp : TrendingDown,
      gradient: kpis.profitMargin >= 0 ? "from-violet-500 to-purple-600" : "from-red-500 to-rose-600",
      bg: kpis.profitMargin >= 0 ? "bg-violet-50 dark:bg-violet-950/40" : "bg-red-50 dark:bg-red-950/40",
      text: kpis.profitMargin >= 0 ? "text-violet-700 dark:text-violet-300" : "text-red-600 dark:text-red-400",
      suffix: kpis.profitMargin >= 0 ? t("healthy", "جيد") : t("review", "مراجعة"),
    },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6"><Skeleton className="h-8 w-24" /></CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-0"><Skeleton className="h-[300px] w-full" /></CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("Accounting & Finance", "الحسابات والمالية")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("Manual profit tracking — independent from Noon sync", "تتبع الأرباح يدوياً - مستقل عن مزامنة نون")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="size-3.5" />
            {t("Refresh", "تحديث")}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={openAddForm}
          >
            <Plus className="size-3.5" />
            {t("Add Record", "إضافة سجل")}
          </Button>
        </div>
      </div>

      {/* Month/Year Filter — forced LTR so arrows always point correctly */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-sm" dir="ltr">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToPrevMonth}
            aria-label={t("Previous month", "الشهر السابق")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-[160px] flex-col items-center">
            <span className="text-base font-bold tracking-tight">{monthLabel}</span>
            <span className="text-xs text-muted-foreground">
              {kpis.recordCount} {t("records", "سجلات")}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToNextMonth}
            aria-label={t("Next month", "الشهر التالي")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards — colorful */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={cn(
              "relative overflow-hidden rounded-xl border p-5 shadow-sm transition-all hover:shadow-md",
              card.bg
            )}
          >
            <div className={cn("absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r", card.gradient)} />
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                <p className={cn("mt-2 text-2xl font-extrabold tabular-nums", card.text)}>
                  {card.display}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{card.suffix}</p>
              </div>
              <div className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
                card.gradient
              )}>
                <card.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary bar — positive vs negative breakdown */}
      {kpis.recordCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-lg bg-emerald-100 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {kpis.positiveCount} {t("profitable", "مربح")}
          </span>
          {kpis.negativeCount > 0 && (
            <span className="rounded-lg bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {kpis.negativeCount} {t("at a loss", "بخسارة")}
            </span>
          )}
        </div>
      )}

      {/* Search bar */}
      {kpis.recordCount > 0 && (
        <div className="relative">
          <Search className={cn("absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground", lang === "ar" ? "right-3" : "left-3")} />
          <Input
            placeholder={t("Search by product name, SKU, or document number…", "البحث باسم المنتج، SKU، أو رقم المستند…")}
            className={cn("bg-background text-start", lang === "ar" ? "pr-9" : "pl-9")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground", lang === "ar" ? "left-3" : "right-3")}
              aria-label={t("Clear search", "مسح البحث")}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {/* Spreadsheet-style Table */}
      {filteredRecords.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="space-y-2">
            <Wallet className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">{search ? t("No matching records", "لا توجد سجلات مطابقة") : t("No records for", "لا توجد سجلات لـ") + ` ${monthLabel}`}</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {search
                ? t("Try a different search term.", "جرب كلمة بحث مختلفة.")
                : t('Click "Add Record" to manually enter a sale with cost and selling prices. Net profit is calculated automatically.', 'انقر على "إضافة سجل" لإدخال عملية بيع يدوياً مع أسعار التكلفة والبيع. يتم حساب صافي الربح تلقائياً.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom text-sm">
              {/* Spreadsheet-style header: soft green background */}
              <thead>
                <tr className="bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-950 dark:to-teal-950">
                  <th className="h-11 px-4 text-start font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("Date", "التاريخ")}</th>
                  <th className="h-11 px-4 text-start font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("SKU", "رمز SKU")}</th>
                  <th className="h-11 px-4 text-start font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("Product", "المنتج")}</th>
                  <th className="h-11 px-4 text-start font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("Doc Number", "رقم المستند")}</th>
                  <th className="h-11 px-4 text-end font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("Qty", "الكمية")}</th>
                  <th className="h-11 px-4 text-end font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("Cost Price", "سعر التكلفة")}</th>
                  <th className="h-11 px-4 text-end font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("Selling Price", "سعر البيع")}</th>
                  <th className="h-11 px-4 text-end font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("Net Profit", "صافي الربح")}</th>
                  <th className="h-11 px-4 text-center font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">{t("Actions", "الإجراءات")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, idx) => {
                  const np = netProfit(r)
                  const isPositive = np >= 0
                  // Alternating soft blue / white rows
                  const rowBg = idx % 2 === 0
                    ? "bg-blue-50/60 dark:bg-blue-950/20"
                    : "bg-white dark:bg-card"

                  return (
                    <tr
                      key={r.id}
                      className={cn("border-b border-border/50 transition-colors hover:bg-blue-100/50 dark:hover:bg-blue-900/30", rowBg)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-start text-muted-foreground">
                        {new Date(r.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-start font-mono text-xs font-medium">
                        {r.sku}
                      </td>
                      <td className="px-4 py-3 text-start font-medium max-w-[240px] truncate">
                        {r.product_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-start font-mono text-xs text-muted-foreground">
                        {r.document_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums whitespace-nowrap">
                        {r.quantity}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmt(Number(r.cost_price))}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums font-medium whitespace-nowrap">
                        {fmt(Number(r.selling_price))}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-end font-extrabold tabular-nums whitespace-nowrap",
                        isPositive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      )}>
                        {isPositive ? "+" : ""}{fmt(np)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                            onClick={() => openEditForm(r)}
                            aria-label={t("Edit record", "تعديل السجل")}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(r)}
                            aria-label={t("Delete record", "حذف السجل")}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Totals footer row */}
              <tfoot>
                <tr className="border-t-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 font-bold dark:from-emerald-950/50 dark:to-teal-950/50 dark:border-emerald-800">
                  <td colSpan={4} className="px-4 py-3 text-start text-emerald-800 dark:text-emerald-200">
                    {t(`Totals (${kpis.recordCount} records)`, `الإجمالي (${kpis.recordCount} سجلات)`)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-emerald-800 dark:text-emerald-200">
                    {filteredRecords.reduce((s, r) => s + r.quantity, 0)}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className={cn(
                    "px-4 py-3 text-end tabular-nums",
                    kpis.totalProfit >= 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-red-600 dark:text-red-400"
                  )}>
                    {kpis.totalProfit >= 0 ? "+" : ""}{fmt(kpis.totalProfit)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Record Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) { setFormOpen(open); if (!open) setEditTarget(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editTarget ? <Pencil className="size-5" /> : <Wallet className="size-5" />}
              {editTarget ? t("Edit Finance Record", "تعديل السجل المالي") : t("Add Finance Record", "إضافة سجل مالي")}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? t("Update the sale details. Net profit recalculates automatically as (Selling Price − Cost Price) × Quantity.", "حدّث تفاصيل البيع. يتم إعادة حساب صافي الربح تلقائياً كـ (سعر البيع − سعر التكلفة) × الكمية.")
                : t("Enter the sale details. Net profit is calculated automatically as (Selling Price − Cost Price) × Quantity.", "أدخل تفاصيل البيع. يتم حساب صافي الربح تلقائياً كـ (سعر البيع − سعر التكلفة) × الكمية.")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitRecord} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fin-date">{t("Date", "التاريخ")} <span className="text-destructive">*</span></Label>
                <Input
                  id="fin-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-sku">{t("SKU", "رمز SKU")} <span className="text-destructive">*</span></Label>
                <Input
                  id="fin-sku"
                  placeholder={t("e.g. SKU-001", "مثال: SKU-001")}
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  required
                />
              </div>
            </div>
            <ProductNameAutocomplete
              value={formName}
              onChange={setFormName}
              suggestions={inventoryNames}
            />
            <DocumentNumberAutocomplete
              value={formDocNumber}
              onChange={setFormDocNumber}
              suggestions={documentNumbers}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fin-qty">{t("Quantity", "الكمية")} <span className="text-destructive">*</span></Label>
                <Input
                  id="fin-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-cost">{t("Cost Price", "سعر التكلفة")} <span className="text-destructive">*</span></Label>
                <Input
                  id="fin-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={formCost}
                  onChange={(e) => setFormCost(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-selling">{t("Selling Price", "سعر البيع")} <span className="text-destructive">*</span></Label>
                <Input
                  id="fin-selling"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={formSelling}
                  onChange={(e) => setFormSelling(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Live net profit preview */}
            {formCost && formSelling && formQty && (
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("Preview Net Profit:", "معاينة صافي الربح:")}</span>
                  {(() => {
                    const np = (parseFloat(formSelling) - parseFloat(formCost)) * parseInt(formQty, 10)
                    if (!Number.isFinite(np)) return <span className="font-semibold">—</span>
                    return (
                      <span className={cn(
                        "text-base font-extrabold tabular-nums",
                        np >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      )}>
                        {np >= 0 ? "+" : ""}{fmt(np)}
                      </span>
                    )
                  })()}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setFormOpen(false); setEditTarget(null) }}
                disabled={saving}
              >
                {t("Cancel", "إلغاء")}
              </Button>
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" /> : editTarget ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {saving ? t("Saving…", "جارٍ الحفظ…") : editTarget ? t("Save Changes", "حفظ التغييرات") : t("Add Record", "إضافة سجل")}
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
            <AlertDialogTitle>{t("Delete finance record?", "حذف السجل المالي؟")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("This will permanently remove the record for", "سيؤدي هذا إلى حذف السجل الخاص بـ")}
              <span className="font-medium text-foreground"> {deleteTarget?.product_name}</span>
              ({t("SKU", "رمز SKU")}: {deleteTarget?.sku}). {t("This action cannot be undone.", "لا يمكن التراجع عن هذا الإجراء.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteRecord() }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              {deleting ? t("Deleting…", "جارٍ الحذف…") : t("Delete", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}