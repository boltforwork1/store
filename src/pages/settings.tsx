import { useState } from "react"
import { Building2, Save, Lock, Loader as Loader2, Check, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { supabase } from "@/lib/supabase"
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
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  const strength = passwordStrength(newPassword)
  const passwordsMatch = newPassword === confirmPassword
  const isValid = newPassword.length >= 8 && passwordsMatch

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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account and company profile.
        </p>
      </div>

      {/* Change Password */}
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
    </div>
  )
}
