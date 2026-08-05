import { useState, useEffect } from "react"
import { Lock, Loader as Loader2, Check, Eye, EyeOff, Users, UserPlus, KeyRound, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import { createStaffUser, updateStaffPassword, deleteStaffUser, type StaffUser } from "@/lib/admin"
import { useAuth } from "@/hooks/use-auth"
import { useLanguage } from "@/components/language-provider"
import { cn } from "@/lib/utils"

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const levels = [
    { label: "Too short", color: "bg-muted-foreground/20" },
    { label: "Weak", color: "bg-red-500" },
    { label: "Fair", color: "bg-amber-500" },
    { label: "Good", color: "bg-blue-500" },
    { label: "Strong", color: "bg-emerald-500" },
  ]
  return { score, ...levels[score] }
}

export function SettingsPage() {
  const { isAdmin } = useAuth()
  const { t, lang } = useLanguage()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  // User Management state
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [newStaffEmail, setNewStaffEmail] = useState("")
  const [newStaffPassword, setNewStaffPassword] = useState("")
  const [showStaffPassword, setShowStaffPassword] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null)
  const [editPassword, setEditPassword] = useState("")
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null)
  const [deletingUser, setDeletingUser] = useState(false)

  const strength = passwordStrength(newPassword)
  const passwordsMatch = newPassword === confirmPassword
  const isValid = newPassword.length >= 8 && passwordsMatch

  useEffect(() => {
    if (isAdmin) void loadStaffUsers()
  }, [isAdmin])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long")
      return
    }
    if (!passwordsMatch) {
      toast.error("Passwords do not match")
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (error) {
      toast.error("Failed to update password: " + error.message)
      return
    }

    toast.success("Password updated successfully")
    setNewPassword("")
    setConfirmPassword("")
    setShowNew(false)
    setShowConfirm(false)
  }

  async function loadStaffUsers() {
    setLoadingUsers(true)
    const { data, error } = await supabase
      .from("staff_users")
      .select("id, email, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to load staff users:", error.message)
      setStaffUsers([])
    } else {
      setStaffUsers((data ?? []) as StaffUser[])
    }
    setLoadingUsers(false)
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    const email = newStaffEmail.trim()
    const password = newStaffPassword

    if (!email || !password) {
      toast.error("Email and password are required")
      return
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    setCreatingUser(true)
    const toastId = toast.loading("Creating user account…")

    try {
      const result = await createStaffUser(email, password)
      if (!result.ok) {
        toast.error(result.error || "Failed to create user", { id: toastId })
        return
      }

      toast.success(`User ${email} created successfully`, { id: toastId })
      setNewStaffEmail("")
      setNewStaffPassword("")
      setShowStaffPassword(false)
      await loadStaffUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setCreatingUser(false)
    }
  }

  async function handleUpdatePassword() {
    if (!editTarget) return
    const password = editPassword

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    setSavingPassword(true)
    const toastId = toast.loading(`Updating password for ${editTarget.email}…`)

    try {
      const result = await updateStaffPassword(editTarget.email, password)
      if (!result.ok) {
        toast.error(result.error || "Failed to update password", { id: toastId })
        return
      }

      toast.success(`Password updated for ${editTarget.email}`, { id: toastId })
      setEditTarget(null)
      setEditPassword("")
      setShowEditPassword(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return

    setDeletingUser(true)
    const toastId = toast.loading(`Deleting ${deleteTarget.email}…`)

    try {
      const result = await deleteStaffUser(deleteTarget.email)
      if (!result.ok) {
        toast.error(result.error || "Failed to delete user", { id: toastId })
        return
      }

      toast.success(`User ${deleteTarget.email} deleted`, { id: toastId })
      setDeleteTarget(null)
      await loadStaffUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
    } finally {
      setDeletingUser(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("Settings", "الإعدادات")}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("Manage your account and team", "إدارة حسابك وفريق العمل")}
        </p>
      </div>

      {/* Change Password — Admin only */}
      {isAdmin && (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Lock className="size-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{t("Change Password", "تغيير كلمة المرور")}</CardTitle>
              <CardDescription>{t("Update your account password", "تحديث كلمة مرور حسابك")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("New Password", "كلمة المرور الجديدة")}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  placeholder={t("Enter new password", "أدخل كلمة المرور الجديدة")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pe-10 text-start"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors", lang === "ar" ? "left-3" : "right-3")}
                  aria-label={showNew ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {/* Password strength meter */}
              {newPassword.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-colors",
                          i <= strength.score ? strength.color : "bg-muted-foreground/15"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("Password strength:", "قوة كلمة المرور:")} <span className="font-medium text-foreground">{strength.label}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("Confirm New Password", "تأكيد كلمة المرور الجديدة")}</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  placeholder={t("Re-enter new password", "أعد إدخال كلمة المرور الجديدة")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pe-10 text-start"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors", lang === "ar" ? "left-3" : "right-3")}
                  aria-label={showConfirm ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {/* Match indicator */}
              {confirmPassword.length > 0 && (
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    passwordsMatch ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  )}
                >
                  {passwordsMatch ? (
                    <>
                      <Check className="size-3.5" />
                      {t("Passwords match", "كلمات المرور متطابقة")}
                    </>
                  ) : (
                    <>
                      <span className="size-3.5 rounded-full border-2 border-current" />
                      {t("Passwords do not match", "كلمات المرور غير متطابقة")}
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving || !isValid} className="gap-1.5">
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                {saving ? t("Updating…", "جارٍ التحديث…") : t("Update Password", "تحديث كلمة المرور")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      )}

      {/* User Management Section — Admin only */}
      {isAdmin && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <Users className="size-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>{t("User Management", "إدارة المستخدمين")}</CardTitle>
                <CardDescription className="mt-1">
                  {t("Create staff accounts and reset their passwords. Creating a user here does not sign you out.", "إنشاء حسابات للموظفين وإعادة تعيين كلمات المرور الخاصة بهم. إنشاء مستخدم هنا لا يؤدي إلى تسجيل خروجك.")}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => void loadStaffUsers()}
              disabled={loadingUsers}
            >
              <RefreshCw className={cn("size-3.5", loadingUsers && "animate-spin")} />
              {t("Refresh", "تحديث")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create user form */}
          <form
            onSubmit={handleCreateUser}
            className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-staff-email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Email", "البريد الإلكتروني")}
              </Label>
              <Input
                id="new-staff-email"
                type="email"
                placeholder="newstaff@example.com"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                disabled={creatingUser}
                required
                className="bg-background text-start"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-staff-password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Password", "كلمة المرور")}
              </Label>
              <div className="relative">
                <Input
                  id="new-staff-password"
                  type={showStaffPassword ? "text" : "password"}
                  placeholder={t("At least 8 characters", "8 أحرف على الأقل")}
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  disabled={creatingUser}
                  required
                  className="bg-background pe-9 text-start"
                />
                <button
                  type="button"
                  onClick={() => setShowStaffPassword((s) => !s)}
                  className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground", lang === "ar" ? "left-2.5" : "right-2.5")}
                  tabIndex={-1}
                >
                  {showStaffPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={creatingUser} className="gap-1.5 sm:w-auto">
              {creatingUser ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UserPlus className="size-3.5" />
              )}
              {creatingUser ? t("Creating…", "جارٍ الإنشاء…") : t("Create User", "إنشاء مستخدم")}
            </Button>
          </form>

          {/* Users table */}
          {loadingUsers ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : staffUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
              <Users className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-medium">{t("No staff users yet", "لا يوجد مستخدمون بعد")}</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {t("Create a new user above to add a staff member to your workspace.", "أنشئ مستخدماً جديداً أعلاه لإضافة موظف إلى مساحة عملك.")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="ps-4 text-start">{t("Email", "البريد الإلكتروني")}</TableHead>
                    <TableHead className="text-start">{t("Created", "تاريخ الإنشاء")}</TableHead>
                    <TableHead className="pe-4 text-end">{t("Actions", "الإجراءات")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="ps-4 font-medium text-start">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-7">
                            <AvatarFallback className="text-xs">
                              {user.email.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span>{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground text-start">
                        {new Date(user.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="pe-4 text-end">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                              setEditTarget(user)
                              setEditPassword("")
                              setShowEditPassword(false)
                            }}
                          >
                            <KeyRound className="size-3.5" />
                            {t("Edit Password", "تعديل كلمة المرور")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(user)}
                          >
                            <Trash2 className="size-3.5" />
                            {t("Delete", "حذف")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Edit Password Dialog */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open && !savingPassword) {
            setEditTarget(null)
            setEditPassword("")
            setShowEditPassword(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5" />
              {t("Edit Password", "تعديل كلمة المرور")}
            </DialogTitle>
            <DialogDescription>
              {t("Set a new password for", "قم بتعيين كلمة مرور جديدة لـ")}{" "}
              <span className="font-medium text-foreground">{editTarget?.email}</span>.
              {t("They can sign in with the new password immediately.", "يمكنهم تسجيل الدخول بكلمة المرور الجديدة فوراً.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="edit-password">{t("New Password", "كلمة المرور الجديدة")}</Label>
            <div className="relative">
              <Input
                id="edit-password"
                type={showEditPassword ? "text" : "password"}
                placeholder={t("At least 8 characters", "8 أحرف على الأقل")}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                disabled={savingPassword}
                autoFocus
                className="pe-9 text-start"
              />
              <button
                type="button"
                onClick={() => setShowEditPassword((s) => !s)}
                className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground", lang === "ar" ? "left-2.5" : "right-2.5")}
                tabIndex={-1}
              >
                {showEditPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Must be at least 8 characters.", "يجب أن تكون 8 أحرف على الأقل.")}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditTarget(null)
                setEditPassword("")
                setShowEditPassword(false)
              }}
              disabled={savingPassword}
            >
              {t("Cancel", "إلغاء")}
            </Button>
            <Button
              onClick={handleUpdatePassword}
              disabled={savingPassword || editPassword.length < 8}
              className="gap-1.5"
            >
              {savingPassword ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {savingPassword ? t("Saving…", "جارٍ الحفظ…") : t("Update Password", "تحديث كلمة المرور")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingUser) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" />
              {t("Delete User", "حذف المستخدم")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("This will permanently delete the account for", "سيؤدي هذا إلى حذف حساب")}{" "}
              <span className="font-medium text-foreground">{deleteTarget?.email}</span>.
              {t("They will no longer be able to sign in. This action cannot be undone.", "لن يتمكنوا من تسجيل الدخول بعد الآن. لا يمكن التراجع عن هذا الإجراء.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUser}>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteUser()
              }}
              disabled={deletingUser}
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingUser ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {deletingUser ? t("Deleting…", "جارٍ الحذف…") : t("Delete User", "حذف المستخدم")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
