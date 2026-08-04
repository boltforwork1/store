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

type FinanceRecord = {
  id: string
  date: string
  sku: string
  product_name: string
  quantity: number
  cost_price: number
  selling_price: number
  created_at: string
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

  // Add-record form fields
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formSku, setFormSku] = useState("")
  const [formName, setFormName] = useState("")
  const [formQty, setFormQty] = useState("1")
  const [formCost, setFormCost] = useState("")
  const [formSelling, setFormSelling] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("finance_records")
      .select("id, date, sku, product_name, quantity, cost_price, selling_price, created_at")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Failed to load finance records: " + error.message)
      setRecords([])
    } else {
      setRecords((data ?? []) as FinanceRecord[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Filter records to the selected month/year
  const monthlyRecords = useMemo(() => {
    return records.filter((r) => {
      const d = new Date(r.date)
      return d.getFullYear() === filterYear && d.getMonth() === filterMonth
    })
  }, [records, filterYear, filterMonth])

  const kpis = useMemo(() => {
    let totalProfit = 0
    let totalRevenue = 0
    let totalCostVal = 0
    let positiveCount = 0
    let negativeCount = 0

    for (const r of monthlyRecords) {
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
      recordCount: monthlyRecords.length,
      positiveCount,
      negativeCount,
    }
  }, [monthlyRecords])

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
  }

  function populateForm(record: FinanceRecord) {
    setFormDate(record.date)
    setFormSku(record.sku)
    setFormName(record.product_name)
    setFormQty(String(record.quantity))
    setFormCost(String(record.cost_price))
    setFormSelling(String(record.selling_price))
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

    if (!sku) { toast.error("SKU is required"); return }
    if (!name) { toast.error("Product name is required"); return }
    if (!Number.isFinite(qty) || qty < 1) { toast.error("Quantity must be at least 1"); return }
    if (!Number.isFinite(cost) || cost < 0) { toast.error("Cost price must be a valid number"); return }
    if (!Number.isFinite(selling) || selling < 0) { toast.error("Selling price must be a valid number"); return }

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
        })
        .eq("id", editTarget.id)

      if (error) {
        toast.error("Failed to update record: " + error.message)
        setSaving(false)
        return
      }

      toast.success("Finance record updated")
    } else {
      const { error } = await supabase.from("finance_records").insert({
        date: formDate,
        sku,
        product_name: name,
        quantity: qty,
        cost_price: cost,
        selling_price: selling,
      })

      if (error) {
        toast.error("Failed to add record: " + error.message)
        setSaving(false)
        return
      }

      toast.success("Finance record added")
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
      toast.error("Failed to delete record: " + error.message)
      setDeleting(false)
      return
    }

    toast.success("Record deleted")
    setDeleteTarget(null)
    setDeleting(false)
    await load()
  }

  const monthLabel = `${MONTH_NAMES[filterMonth]} ${filterYear}`

  // KPI card color schemes — lively, distinct colors per card
  const kpiCards = [
    {
      label: "Net Profit",
      value: kpis.totalProfit,
      display: fmt(kpis.totalProfit),
      icon: Wallet,
      gradient: "from-emerald-500 to-teal-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      text: kpis.totalProfit >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400",
      suffix: kpis.totalProfit >= 0 ? "profit" : "loss",
    },
    {
      label: "Total Revenue",
      value: kpis.totalRevenue,
      display: fmt(kpis.totalRevenue),
      icon: Coins,
      gradient: "from-blue-500 to-indigo-600",
      bg: "bg-blue-50 dark:bg-blue-950/40",
      text: "text-blue-700 dark:text-blue-300",
      suffix: "sales",
    },
    {
      label: "Total Cost",
      value: kpis.totalCost,
      display: fmt(kpis.totalCost),
      icon: Receipt,
      gradient: "from-amber-500 to-orange-600",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      text: "text-amber-700 dark:text-amber-300",
      suffix: "expenses",
    },
    {
      label: "Profit Margin",
      value: kpis.profitMargin,
      display: `${kpis.profitMargin.toFixed(1)}%`,
      icon: kpis.profitMargin >= 0 ? TrendingUp : TrendingDown,
      gradient: kpis.profitMargin >= 0 ? "from-violet-500 to-purple-600" : "from-red-500 to-rose-600",
      bg: kpis.profitMargin >= 0 ? "bg-violet-50 dark:bg-violet-950/40" : "bg-red-50 dark:bg-red-950/40",
      text: kpis.profitMargin >= 0 ? "text-violet-700 dark:text-violet-300" : "text-red-600 dark:text-red-400",
      suffix: kpis.profitMargin >= 0 ? "healthy" : "review",
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
          <h2 className="text-xl font-semibold tracking-tight">Accounting & Finance</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manual profit tracking — independent from Noon sync
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={openAddForm}
          >
            <Plus className="size-3.5" />
            Add Record
          </Button>
        </div>
      </div>

      {/* Month/Year Filter */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToPrevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-[160px] flex-col items-center">
            <span className="text-base font-bold tracking-tight">{monthLabel}</span>
            <span className="text-xs text-muted-foreground">
              {kpis.recordCount} record{kpis.recordCount === 1 ? "" : "s"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToNextMonth}
            aria-label="Next month"
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
            {kpis.positiveCount} profitable
          </span>
          {kpis.negativeCount > 0 && (
            <span className="rounded-lg bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {kpis.negativeCount} at a loss
            </span>
          )}
        </div>
      )}

      {/* Spreadsheet-style Table */}
      {monthlyRecords.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="space-y-2">
            <Wallet className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No records for {monthLabel}</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Click "Add Record" to manually enter a sale with cost and selling prices.
              Net profit is calculated automatically.
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
                  <th className="h-11 px-4 text-left font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">Date</th>
                  <th className="h-11 px-4 text-left font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">SKU</th>
                  <th className="h-11 px-4 text-left font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">Product</th>
                  <th className="h-11 px-4 text-right font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">Qty</th>
                  <th className="h-11 px-4 text-right font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">Cost Price</th>
                  <th className="h-11 px-4 text-right font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">Selling Price</th>
                  <th className="h-11 px-4 text-right font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">Net Profit (الصافي)</th>
                  <th className="h-11 px-4 text-center font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRecords.map((r, idx) => {
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
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {new Date(r.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-medium">
                        {r.sku}
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[240px] truncate">
                        {r.product_name}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                        {r.quantity}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmt(Number(r.cost_price))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap">
                        {fmt(Number(r.selling_price))}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right font-extrabold tabular-nums whitespace-nowrap",
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
                            aria-label="Edit record"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(r)}
                            aria-label="Delete record"
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
                  <td colSpan={3} className="px-4 py-3 text-emerald-800 dark:text-emerald-200">
                    Totals ({kpis.recordCount} records)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-800 dark:text-emerald-200">
                    {monthlyRecords.reduce((s, r) => s + r.quantity, 0)}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className={cn(
                    "px-4 py-3 text-right tabular-nums",
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
              {editTarget ? "Edit Finance Record" : "Add Finance Record"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update the sale details. Net profit recalculates automatically as (Selling Price − Cost Price) × Quantity."
                : "Enter the sale details. Net profit is calculated automatically as (Selling Price − Cost Price) × Quantity."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitRecord} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fin-date">Date <span className="text-destructive">*</span></Label>
                <Input
                  id="fin-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-sku">SKU <span className="text-destructive">*</span></Label>
                <Input
                  id="fin-sku"
                  placeholder="e.g. SKU-001"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-name">Product Name <span className="text-destructive">*</span></Label>
              <Input
                id="fin-name"
                placeholder="e.g. Wireless Headphones"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fin-qty">Quantity <span className="text-destructive">*</span></Label>
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
                <Label htmlFor="fin-cost">Cost Price <span className="text-destructive">*</span></Label>
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
                <Label htmlFor="fin-selling">Selling Price <span className="text-destructive">*</span></Label>
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
                  <span className="text-muted-foreground">Preview Net Profit:</span>
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
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-4 animate-spin" /> : editTarget ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {saving ? "Saving…" : editTarget ? "Save Changes" : "Add Record"}
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
            <AlertDialogTitle>Delete finance record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the record for
              <span className="font-medium text-foreground"> {deleteTarget?.product_name}</span>
              (SKU: {deleteTarget?.sku}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteRecord() }}
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