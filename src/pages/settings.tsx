import {
  Bell,
  Building2,
  CreditCard,
  Globe,
  Lock,
  Palette,
  Save,
  Shield,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account, workspace, and preferences
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
          {[
            { value: "general", label: "General", icon: Building2 },
            { value: "team", label: "Team", icon: Users },
            { value: "billing", label: "Billing", icon: CreditCard },
            { value: "notifications", label: "Notifications", icon: Bell },
            { value: "security", label: "Security", icon: Shield },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 gap-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="mt-6 space-y-6">
          {/* Company Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Profile</CardTitle>
              <CardDescription>Update your company's public information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  <AvatarFallback className="text-lg font-bold bg-primary text-primary-foreground rounded-xl">
                    NC
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
                  <Input id="company-name" defaultValue="NexCommerce Inc." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="industry">Industry</Label>
                  <Select defaultValue="ecommerce">
                    <SelectTrigger id="industry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ecommerce">E-Commerce</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="wholesale">Wholesale</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" defaultValue="https://nexco.io" type="url" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select defaultValue="est">
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="est">Eastern Time (ET)</SelectItem>
                      <SelectItem value="pst">Pacific Time (PT)</SelectItem>
                      <SelectItem value="cst">Central Time (CT)</SelectItem>
                      <SelectItem value="utc">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-full space-y-1.5">
                  <Label htmlFor="bio">Description</Label>
                  <Textarea
                    id="bio"
                    rows={3}
                    defaultValue="Enterprise e-commerce operations platform serving B2B and B2C channels worldwide."
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

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Customize the look and feel of your dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Palette className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Dark mode</p>
                    <p className="text-xs text-muted-foreground">Switch between light and dark themes</p>
                  </div>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Globe className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Language</p>
                    <p className="text-xs text-muted-foreground">Select your preferred language</p>
                  </div>
                </div>
                <Select defaultValue="en">
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Team Members</CardTitle>
                  <CardDescription>Manage access and roles for your team</CardDescription>
                </div>
                <Button size="sm">Invite member</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {[
                { name: "James Doe", email: "james@nexco.io", role: "Owner", initials: "JD", active: true },
                { name: "Sarah Chen", email: "sarah@nexco.io", role: "Admin", initials: "SC", active: true },
                { name: "Marcus Webb", email: "m.webb@nexco.io", role: "Manager", initials: "MW", active: true },
                { name: "Priya Nair", email: "p.nair@nexco.io", role: "Viewer", initials: "PN", active: false },
              ].map((member, i, arr) => (
                <div
                  key={member.email}
                  className={`flex items-center gap-4 px-6 py-4 ${i < arr.length - 1 ? "border-b" : ""}`}
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-muted">
                      {member.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <Badge variant={member.active ? "secondary" : "outline"} className="text-xs">
                    {member.role}
                  </Badge>
                  <Button variant="ghost" size="sm" className="text-xs">
                    Edit
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Plan</CardTitle>
              <CardDescription>You are on the Enterprise plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div>
                  <p className="font-semibold">Enterprise</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Unlimited products · 5 warehouses · Priority support
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">$499<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                  <Button variant="outline" size="sm" className="mt-2">Manage plan</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <CreditCard className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Visa ending in 4242</p>
                  <p className="text-xs text-muted-foreground">Expires 12/2027</p>
                </div>
                <Badge className="ml-auto" variant="secondary">Default</Badge>
              </div>
              <Button variant="outline" size="sm">Add payment method</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>Choose what you want to be notified about</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {[
                { title: "New orders", description: "Get notified when a new order comes in", enabled: true },
                { title: "Low stock alerts", description: "Alert when a product drops below threshold", enabled: true },
                { title: "Payment confirmations", description: "Notify on successful payments", enabled: true },
                { title: "Shipment updates", description: "Updates on outbound shipments", enabled: false },
                { title: "Weekly digest", description: "A weekly summary of your store performance", enabled: false },
                { title: "Security alerts", description: "Important account security notifications", enabled: true },
              ].map((item, i, arr) => (
                <div
                  key={item.title}
                  className={`flex items-center justify-between px-6 py-4 ${i < arr.length - 1 ? "border-b" : ""}`}
                >
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <Switch defaultChecked={item.enabled} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5 max-w-sm">
                <Label htmlFor="current-pw">Current password</Label>
                <Input id="current-pw" type="password" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <Label htmlFor="new-pw">New password</Label>
                <Input id="new-pw" type="password" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <Label htmlFor="confirm-pw">Confirm new password</Label>
                <Input id="confirm-pw" type="password" />
              </div>
              <Button size="sm" className="gap-1.5">
                <Lock className="size-3.5" />
                Update password
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
              <CardDescription>Add an extra layer of security to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Authenticator app</p>
                    <p className="text-xs text-muted-foreground">Use an app like Google Authenticator</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">Enable</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
