import { useState, useEffect } from "react"
import { Building2, Save, Lock, Loader as Loader2, Check, Eye, EyeOff, Users, UserPlus, KeyRound, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
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
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import { createStaffUser, updateStaffPassword, type StaffUser } from "@/lib/admin"
import { useAuth } from "@/hooks/use-auth"
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account and company profile.
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
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showNew ? "Hide password" : "Show password"}
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
                    Password strength: <span className="font-medium text-foreground">{strength.label}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
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
                      Passwords match
                    </>
                  ) : (
                    <>
                      <span className="size-3.5 rounded-full border-2 border-current" />
                      Passwords do not match
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
                {saving ? "Updating…" : "Update Password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      )}

      {/* Company Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Building2 className="size-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Company Profile</CardTitle>
              <CardDescription>Update your company's public information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarFallback className="text-lg font-bold bg-muted text-muted-foreground rounded-xl">
                —
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1.5">
              <Button variant="outline" size="sm">Change logo</Button>
              <p className="text-xs text-muted-foreground">PNG, JPG or SVG · max 2MB</p>
            </div>
          </div>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="company-name">Company name</Label>
              <Input id="company-name" placeholder="Your company name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" placeholder="https://" type="url" />
            </div>
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="bio">Description</Label>
              <Textarea
                id="bio"
                rows={3}
                placeholder="Briefly describe your business — this will be used to map your Noon Partner profile."
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5">
              <Save className="size-3.5" />
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

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
                <CardTitle>User Management</CardTitle>
                <CardDescription className="mt-1">
                  Create staff accounts and reset their passwords. Creating a
                  user here does not sign you out.
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
              Refresh
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
                Email
              </Label>
              <Input
                id="new-staff-email"
                type="email"
                placeholder="newstaff@example.com"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                disabled={creatingUser}
                required
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-staff-password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="new-staff-password"
                  type={showStaffPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  disabled={creatingUser}
                  required
                  className="bg-background pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowStaffPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
              {creatingUser ? "Creating…" : "Create User"}
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
              <p className="mt-2 text-sm font-medium">No staff users yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Create a new user above to add a staff member to your workspace.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Email</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="pl-4 font-medium">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-7">
                            <AvatarFallback className="text-xs">
                              {user.email.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span>{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
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
                          Edit Password
                        </Button>
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
              Edit Password
            </DialogTitle>
            <DialogDescription>
              Set a new password for{" "}
              <span className="font-medium text-foreground">{editTarget?.email}</span>.
              They can sign in with the new password immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="edit-password">New Password</Label>
            <div className="relative">
              <Input
                id="edit-password"
                type={showEditPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                disabled={savingPassword}
                autoFocus
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowEditPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showEditPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters.
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
              Cancel
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
              {savingPassword ? "Saving…" : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
