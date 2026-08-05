import { NavLink, useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  Settings,
  Zap,
  Calculator,
  Boxes,
  FileText,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { useLanguage } from "@/components/language-provider"

const navItems = [
  {
    title: { en: "Overview", ar: "نظرة عامة" },
    url: "/overview",
    icon: LayoutDashboard,
  },
  {
    title: { en: "Products", ar: "المنتجات" },
    url: "/products",
    icon: Package,
  },
  {
    title: { en: "Inventory", ar: "مخزون نون" },
    url: "/inventory",
    icon: Warehouse,
  },
  {
    title: { en: "Internal Stock", ar: "المخزون الداخلي" },
    url: "/internal-stock",
    icon: Boxes,
  },
  {
    title: { en: "Orders", ar: "الطلبات" },
    url: "/orders",
    icon: ShoppingCart,
  },
  {
    title: { en: "Documents", ar: "المستندات" },
    url: "/documents",
    icon: FileText,
  },
  {
    title: { en: "Accounting", ar: "الحسابات" },
    url: "/accounting",
    icon: Calculator,
  },
  {
    title: { en: "Settings", ar: "الإعدادات" },
    url: "/settings",
    icon: Settings,
  },
] as const

export function AppSidebar() {
  const location = useLocation()
  const { user } = useAuth()
  const { lang, t } = useLanguage()
  const userEmail = user?.email ?? ""
  const userInitial = userEmail.charAt(0).toUpperCase() || "U"
  const userName = user?.user_metadata?.full_name ?? userEmail.split("@")[0] ?? "User"

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border pb-3">
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm">
            <Zap className="size-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              NexCommerce
            </span>
            <span className="text-xs text-muted-foreground">Enterprise Suite</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
            {t("Main Menu", "القائمة الرئيسية")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  location.pathname === item.url ||
                  location.pathname.startsWith(item.url + "/")
                const itemTitle = item.title[lang]
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={itemTitle}
                      className={cn(
                        "rounded-lg transition-all duration-150",
                        isActive &&
                          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      )}
                    >
                      <NavLink to={item.url} className="flex items-center gap-2.5">
                        <item.icon className="size-4 shrink-0" />
                        <span className="font-medium">{itemTitle}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="rounded-lg"
              tooltip={t("User Profile", "ملف المستخدم")}
            >
              <Avatar className="size-7 shrink-0">
                <AvatarImage src="" alt={userName} />
                <AvatarFallback className="text-xs font-semibold bg-primary text-primary-foreground">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium leading-none">{userName}</span>
                <span className="text-xs text-muted-foreground">{userEmail}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
