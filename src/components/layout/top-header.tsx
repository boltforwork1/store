import { useLocation, useNavigate } from "react-router-dom"
import { Bell, Search, SunMoon } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  "/overview": { title: "Overview", description: "Your business at a glance" },
  "/products": { title: "Products", description: "Manage your product catalog" },
  "/inventory": { title: "Inventory", description: "Track stock levels and warehouses" },
  "/orders": { title: "Orders", description: "Review and fulfill customer orders" },
  "/settings": { title: "Settings", description: "Configure your workspace" },
}

const notifications = [
  {
    id: 1,
    title: "New order received",
    description: "Order #4521 from Acme Corp — $1,240.00",
    time: "2 min ago",
    unread: true,
  },
  {
    id: 2,
    title: "Low stock alert",
    description: "SKU-2291 has fallen below threshold",
    time: "14 min ago",
    unread: true,
  },
  {
    id: 3,
    title: "Shipment delivered",
    description: "Order #4498 was delivered successfully",
    time: "1 hr ago",
    unread: false,
  },
  {
    id: 4,
    title: "Payment confirmed",
    description: "Invoice #1092 — $5,800.00 cleared",
    time: "3 hr ago",
    unread: false,
  },
]

export function TopHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { theme, setTheme } = useTheme()
  const userEmail = user?.email ?? ""
  const userInitial = userEmail.charAt(0).toUpperCase() || "U"
  const userName = user?.user_metadata?.full_name ?? userEmail.split("@")[0] ?? "User"
  const pageInfo = PAGE_TITLES[location.pathname] ?? { title: "Dashboard", description: "" }
  const unreadCount = notifications.filter((n) => n.unread).length

  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <div className="hidden flex-col sm:flex">
          <h1 className="text-sm font-semibold leading-none text-foreground">
            {pageInfo.title}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{pageInfo.description}</p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden md:flex">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search products, orders…"
            className="h-8 w-56 rounded-lg bg-muted/50 pl-8 text-sm border-transparent focus-visible:bg-background focus-visible:border-input transition-all duration-150 lg:w-72"
          />
        </div>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative rounded-lg"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            </div>
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50 cursor-pointer",
                    n.unread && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      n.unread ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                  />
                  <div className="flex-1 space-y-0.5">
                    <p className="font-medium leading-snug">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.description}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{n.time}</span>
                </div>
              ))}
            </div>
            <div className="border-t px-4 py-2.5">
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                View all notifications
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-lg"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          <SunMoon className="size-4" />
        </Button>

        {/* User avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 rounded-lg p-0 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-8">
                <AvatarImage src="" alt={userName} />
                <AvatarFallback className="rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span>{userName}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {userEmail}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuItem>Team</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async () => {
                await signOut()
                navigate("/login", { replace: true })
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
