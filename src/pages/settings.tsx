import { Building2, Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your company profile — these details map to your Noon Partner account once the integration is connected.
        </p>
      </div>

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
