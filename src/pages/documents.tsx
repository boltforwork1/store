import { useCallback, useEffect, useState } from "react"
import {
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Loader as Loader2,
  FileText,
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

type Document = {
  id: string
  date: string
  document_number: string
  total_amount: number
  created_at: string
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function DocumentsPage() {
  const { t, lang } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<Document[]>([])
  const [search, setSearch] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Document | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form fields
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formNumber, setFormNumber] = useState("")
  const [formAmount, setFormAmount] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("documents")
      .select("id, date, document_number, total_amount, created_at")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      toast.error(t("Failed to load documents", "فشل تحميل المستندات") + ": " + error.message)
      setDocuments([])
    } else {
      setDocuments((data ?? []) as Document[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function resetForm() {
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNumber("")
    setFormAmount("")
    setEditTarget(null)
  }

  function populateForm(doc: Document) {
    setFormDate(doc.date)
    setFormNumber(doc.document_number)
    setFormAmount(String(doc.total_amount))
  }

  function openAddForm() {
    setEditTarget(null)
    resetForm()
    setFormOpen(true)
  }

  function openEditForm(doc: Document) {
    setEditTarget(doc)
    populateForm(doc)
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const number = formNumber.trim()
    const amount = parseFloat(formAmount)

    if (!number) { toast.error(t("Document number is required", "رقم المستند مطلوب")); return }
    if (!Number.isFinite(amount) || amount < 0) { toast.error(t("Total amount must be a valid number", "يجب أن يكون المبلغ الإجمالي رقماً صالحاً")); return }

    setSaving(true)

    if (editTarget) {
      const { error } = await supabase
        .from("documents")
        .update({
          date: formDate,
          document_number: number,
          total_amount: amount,
        })
        .eq("id", editTarget.id)

      if (error) {
        toast.error(t("Failed to update document", "فشل تحديث المستند") + ": " + error.message)
        setSaving(false)
        return
      }

      toast.success(t("Document updated", "تم تحديث المستند"))
    } else {
      const { error } = await supabase.from("documents").insert({
        date: formDate,
        document_number: number,
        total_amount: amount,
      })

      if (error) {
        toast.error(t("Failed to add document", "فشل إضافة المستند") + ": " + error.message)
        setSaving(false)
        return
      }

      toast.success(t("Document added", "تم إضافة المستند"))
    }

    resetForm()
    setFormOpen(false)
    setSaving(false)
    await load()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)

    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", deleteTarget.id)

    if (error) {
      toast.error(t("Failed to delete document", "فشل حذف المستند") + ": " + error.message)
      setDeleting(false)
      return
    }

    toast.success(t("Document deleted", "تم حذف المستند"))
    setDeleteTarget(null)
    setDeleting(false)
    await load()
  }

  const filtered = documents.filter((d) => {
    const q = search.trim().toLowerCase()
    if (q === "") return true
    return d.document_number.toLowerCase().includes(q)
  })

  const totalAmount = filtered.reduce((sum, d) => sum + Number(d.total_amount), 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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
          <h2 className="text-xl font-semibold tracking-tight">{t("Documents", "المستندات")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("Track and manage your documents", "تتبع وإدارة مستنداتك")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="size-3.5" />
            {t("Refresh", "تحديث")}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={openAddForm}>
            <Plus className="size-3.5" />
            {t("Add Document", "إضافة مستند")}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {documents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:from-blue-950/40 dark:to-indigo-950/40">
            <p className="text-sm text-muted-foreground">{t("Total Documents", "إجمالي المستندات")}</p>
            <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">
              {filtered.length}
            </p>
          </div>
          <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-teal-50 p-4 dark:from-emerald-950/40 dark:to-teal-950/40">
            <p className="text-sm text-muted-foreground">{t("Total Amount", "إجمالي المبلغ")}</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {fmt(totalAmount)}
            </p>
          </div>
        </div>
      )}

      {/* Search bar */}
      {documents.length > 0 && (
        <div className="relative">
          <Search className={cn("absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground", lang === "ar" ? "right-3" : "left-3")} />
          <Input
            placeholder={t("Search by document number…", "البحث برقم المستند…")}
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

      {/* Table */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="space-y-2">
            <FileText className="mx-auto size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">
              {documents.length === 0 ? t("No documents yet", "لا توجد مستندات بعد") : t("No matching documents", "لا توجد مستندات مطابقة")}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {documents.length === 0
                ? t('Click "Add Document" to create your first document.', 'انقر على "إضافة مستند" لإنشاء مستندك الأول.')
                : t("Try a different search term.", "جرب كلمة بحث مختلفة.")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-950 dark:to-indigo-950">
                  <th className="h-11 px-4 text-start font-bold text-blue-800 dark:text-blue-200 whitespace-nowrap">{t("Date", "التاريخ")}</th>
                  <th className="h-11 px-4 text-start font-bold text-blue-800 dark:text-blue-200 whitespace-nowrap">{t("Document Number", "رقم المستند")}</th>
                  <th className="h-11 px-4 text-end font-bold text-blue-800 dark:text-blue-200 whitespace-nowrap">{t("Total Amount", "إجمالي المبلغ")}</th>
                  <th className="h-11 px-4 text-center font-bold text-blue-800 dark:text-blue-200 whitespace-nowrap">{t("Actions", "الإجراءات")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc, idx) => {
                  const rowBg = idx % 2 === 0
                    ? "bg-blue-50/60 dark:bg-blue-950/20"
                    : "bg-white dark:bg-card"
                  return (
                    <tr
                      key={doc.id}
                      className={cn(
                        "border-b border-border/50 transition-colors hover:bg-blue-100/50 dark:hover:bg-blue-900/30",
                        rowBg
                      )}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-start text-muted-foreground">
                        {new Date(doc.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-start font-mono text-xs font-medium">
                        {doc.document_number}
                      </td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums whitespace-nowrap">
                        {fmt(Number(doc.total_amount))}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                            onClick={() => openEditForm(doc)}
                            aria-label="Edit document"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(doc)}
                            aria-label="Delete document"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 font-bold dark:from-blue-950/50 dark:to-indigo-950/50 dark:border-blue-800">
                  <td className="px-4 py-3 text-start text-blue-800 dark:text-blue-200">
                    {t(`Totals (${filtered.length} documents)`, `الإجمالي (${filtered.length} مستندات)`)}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-end tabular-nums text-blue-800 dark:text-blue-200">
                    {fmt(totalAmount)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Document Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) { setFormOpen(open); if (!open) setEditTarget(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editTarget ? <Pencil className="size-5" /> : <FileText className="size-5" />}
              {editTarget ? t("Edit Document", "تعديل المستند") : t("Add Document", "إضافة مستند")}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? t("Update the document details below.", "حدّث تفاصيل المستند أدناه.")
                : t("Enter the document details. All fields are required.", "أدخل تفاصيل المستند. جميع الحقول مطلوبة.")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-date">{t("Date", "التاريخ")} <span className="text-destructive">*</span></Label>
              <Input
                id="doc-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-number">{t("Document Number", "رقم المستند")} <span className="text-destructive">*</span></Label>
              <Input
                id="doc-number"
                placeholder={t("e.g. INV-2026-001", "مثال: INV-2026-001")}
                value={formNumber}
                onChange={(e) => setFormNumber(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-amount">{t("Total Amount", "إجمالي المبلغ")} <span className="text-destructive">*</span></Label>
              <Input
                id="doc-amount"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
              />
            </div>
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
                {saving ? t("Saving…", "جارٍ الحفظ…") : editTarget ? t("Save Changes", "حفظ التغييرات") : t("Add Document", "إضافة مستند")}
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
            <AlertDialogTitle>{t("Delete document?", "حذف المستند؟")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("This will permanently remove document", "سيؤدي هذا إلى حذف المستند")}
              <span className="font-medium text-foreground"> {deleteTarget?.document_number}</span>.
              {t("This action cannot be undone.", "لا يمكن التراجع عن هذا الإجراء.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
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
