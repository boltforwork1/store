import { useLocation, useNavigate } from "react-router-dom"
import { Bell, Search, SunMoon } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { useLanguage } from "@/components/language-provider"
import { LanguageToggle } from "@/components/language-toggle"

const PAGE_TITLES: Record<string, { title: { en: string; ar: string }; description: { en: string; ar: string } }> = {
  "/overview": { title: { en: "Overview", ar: "نظرة عامة" }, description: { en: "Your business at a glance", ar: "نظرة سريعة على عملك" } },
  "/products": { title: { en: "Products", ar: "المنتجات" }, description: { en: "Manage your product catalog", ar: "إدارة كتالوج المنتجات" } },
  "/inventory": { title: { en: "Inventory", ar: "المخزون" }, description: { en: "Track stock levels and warehouses", ar: "تتبع مستويات المخزون والمستودعات" } },
  "/orders": { title: { en: "Orders", ar: "الطلبات" }, description: { en: "Review and fulfill customer orders", ar: "مراجعة وتلبيه طلبات العملاء" } },
  "/documents": { title: { en: "Documents", ar: "المستندات" }, description: { en: "Track and manage your documents", ar: "تتبع وإدارة مستنداتك" } },
  "/accounting": { title: { en: "Accounting", ar: "الحسابات" }, description: { en: "Track profits and financial records", ar: "تتبع الأرباح والسجلات المالية" } },
  "/internal-stock": { title: { en: "Internal Stock", ar: "المخزون الداخلي" }, description: { en: "Manage your own inventory manually", ar: "إدارة مخزونك الخاص يدوياً" } },
  "/settings": { title: { en: "Settings", ar: "الإعدادات" }, description: { en: "Configure your workspace", ar: "تكوين مساحة العمل" } },
}

export function TopHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { theme, setTheme } = useTheme()
  const { lang } = useLanguage()
  const userEmail = user?.email ?? ""
  const userInitial = userEmail.charAt(0).toUpperCase() || "U"
  const userName = user?.user_metadata?.full_name ?? userEmail.split("@")[0] ?? "User"
  const pageInfo = PAGE_TITLES[location.pathname] ?? { title: { en: "Dashboard", ar: "لوحة التحكم" }, description: { en: "", ar: "" } }
  const pageTitle = pageInfo.title[lang]
  const pageDescription = pageInfo.description[lang]

  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <div className="hidden flex-col sm:flex">
          <h1 className="text-sm font-semibold leading-none text-foreground">
            {pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{pageDescription}</p>
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
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              <span className="text-xs text-muted-foreground">0 new</span>
            </div>
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Bell className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">No notifications yet</p>
              <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                Once your Noon API sync is active, system events will appear here.
              </p>
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

        {/* Language toggle */}
        <LanguageToggle />

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
