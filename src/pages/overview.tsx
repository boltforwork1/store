import { useEffect, useState } from "react"
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Database,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { computeDisplayStatus, statusBadgeClass, computeDisplayTotal, isRevenueEligible } from "@/lib/order-status"
import type { OrderItem } from "@/lib/types"
import { useLanguage } from "@/components/language-provider"

type Kpi = {
  title: string
  value: string
  change: string | null
  trend: "up" | "down" | null
  icon: typeof DollarSign
  description: string
}

type RevenuePoint = { month: string; revenue: number; orders: number }
type CategoryPoint = { name: string; value: number; color: string }
type WeeklyPoint = { day: string; orders: number }
type RecentOrder = {
  id: string
  noon_order_id: string | null
  fbpi_order_nr: string | null
  total_price: number | null
  status: string | null
  order_date: string | null
  displayStatus: string
  displayTotal: number
}

const revenueChartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-2)" },
}

const ordersChartConfig = {
  orders: { label: "Orders", color: "var(--chart-1)" },
}

export function OverviewPage() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([])
  const [categoryData, setCategoryData] = useState<CategoryPoint[]>([])
  const [weeklyOrders, setWeeklyOrders] = useState<WeeklyPoint[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])

  const load = async () => {
    setLoading(true)

    const [productsRes, ordersRes, recentRes] = await Promise.all([
      supabase.from("products").select("id, name, price, stock_qty, is_active"),
      supabase.from("orders").select("id, noon_order_id, fbpi_order_nr, total_price, status, order_date, customer_country_code"),
      supabase
        .from("orders")
        .select("id, noon_order_id, fbpi_order_nr, total_price, status, order_date, customer_country_code")
        .order("order_date", { ascending: false })
        .limit(5),
    ])

    const products = productsRes.data ?? []
    const orders = ordersRes.data ?? []
    const recent = recentRes.data ?? []

    // Fetch order_items for the recent orders so we can compute the dynamic
    // display status (e.g. show CANCELLED when all items are OOS).
    const recentIds = (recent as unknown as { fbpi_order_nr: string | null }[])
      .map((o) => o.fbpi_order_nr)
      .filter((v): v is string => v != null)
    let recentItemsByOrder: Record<string, OrderItem[]> = {}
    if (recentIds.length > 0) {
      const { data: recentItems } = await supabase
        .from("order_items")
        .select("mp_item_nr, fbpi_order_nr, partner_sku, mp_status, integration_status, price")
        .in("fbpi_order_nr", recentIds)
      if (recentItems) {
        for (const it of recentItems as OrderItem[]) {
          if (!recentItemsByOrder[it.fbpi_order_nr]) recentItemsByOrder[it.fbpi_order_nr] = []
          recentItemsByOrder[it.fbpi_order_nr].push(it)
        }
      }
    }

    // Fetch order_items for ALL orders so revenue can fall back to
    // summing line items when the parent order's total is missing.
    const allOrderIds = (orders as unknown as { fbpi_order_nr: string | null }[])
      .map((o) => o.fbpi_order_nr)
      .filter((v): v is string => v != null)
    let allItemsByOrder: Record<string, OrderItem[]> = recentItemsByOrder
    const missingIds = allOrderIds.filter((id) => !allItemsByOrder[id])
    if (missingIds.length > 0) {
      const { data: missingItems } = await supabase
        .from("order_items")
        .select("mp_item_nr, fbpi_order_nr, partner_sku, mp_status, integration_status, price")
        .in("fbpi_order_nr", missingIds)
      if (missingItems) {
        for (const it of missingItems as OrderItem[]) {
          if (!allItemsByOrder[it.fbpi_order_nr]) allItemsByOrder[it.fbpi_order_nr] = []
          allItemsByOrder[it.fbpi_order_nr].push(it)
        }
      }
    }
    const recentWithStatus = (recent as unknown as (RecentOrder & { fbpi_order_nr: string | null })[]).map((o) => ({
      ...o,
      displayStatus: computeDisplayStatus(o.status, recentItemsByOrder[o.fbpi_order_nr ?? ""]),
      displayTotal: computeDisplayTotal(o.total_price, recentItemsByOrder[o.fbpi_order_nr ?? ""]),
    }))

    const activeProducts = products.filter((p) => p.is_active !== false).length
    const totalRevenue = orders
      .filter((o) => isRevenueEligible(o.status))
      .reduce((sum, o) => {
        const items = o.fbpi_order_nr ? allItemsByOrder[o.fbpi_order_nr] : undefined
        return sum + computeDisplayTotal(o.total_price, items)
      }, 0)

    setKpis([
      {
        title: t("Total Revenue", "إجمالي الأرباح"),
        value: `${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        change: null,
        trend: null,
        icon: DollarSign,
        description: t("from confirmed & shipped orders", "من الطلبات المؤكدة والمشحونة"),
      },
      {
        title: t("Total Orders", "إجمالي الطلبات"),
        value: orders.length > 0 ? orders.length.toLocaleString() : "—",
        change: null,
        trend: null,
        icon: ShoppingCart,
        description: t("from synced FBPI orders", "من طلبات FBPI المتزامنة"),
      },
      {
        title: t("Active Products", "المنتجات النشطة"),
        value: activeProducts > 0 ? activeProducts.toLocaleString() : "—",
        change: null,
        trend: null,
        icon: Package,
        description: t("in catalog", "في الكتالوج"),
      },
      {
        title: t("Total Products", "إجمالي المنتجات"),
        value: products.length > 0 ? products.length.toLocaleString() : "—",
        change: null,
        trend: null,
        icon: Users,
        description: t("synced from Noon", "متزامن من نون"),
      },
    ])

    setRevenueData([])
    setCategoryData([])
    setWeeklyOrders([])
    setRecentOrders(recentWithStatus)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const hasData = kpis.some((k) => k.value !== "—") || recentOrders.length > 0

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent><Skeleton className="h-[260px] w-full" /></CardContent>
          </Card>
          <Card>
            <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
            <CardContent><Skeleton className="h-[260px] w-full" /></CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-4 pt-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Database className="size-6 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold">{t("No data yet", "لا توجد بيانات بعد")}</h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Your dashboard is connected to the Noon Partner API. Once you run a catalog sync, products and orders will populate here automatically.",
                  "لوحة التحكم الخاصة بك متصلة بواجهة برمجة الشريك نون. بمجرد تشغيل مزامنة الكتالوج، ستظهر المنتجات والطلبات هنا تلقائياً."
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
              <RefreshCw className="size-3.5" />
              {t("Refresh", "تحديث")}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-sm font-medium text-muted-foreground">
                  {kpi.title}
                </CardDescription>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <kpi.icon className="size-4 text-muted-foreground" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold tracking-tight">{kpi.value}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {kpi.change && kpi.trend && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5 text-xs font-medium",
                          kpi.trend === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                        )}
                      >
                        {kpi.trend === "up" ? (
                          <ArrowUpRight className="size-3" />
                        ) : (
                          <ArrowDownRight className="size-3" />
                        )}
                        {kpi.change}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{kpi.description}</span>
                  </div>
                </div>
                {kpi.trend === "up" ? (
                  <TrendingUp className="size-8 text-emerald-500/20" />
                ) : kpi.trend === "down" ? (
                  <TrendingDown className="size-8 text-red-400/20" />
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Chart - spans 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <div>
              <CardTitle className="text-base">{t("Revenue Overview", "نظرة عامة على الأرباح")}</CardTitle>
              <CardDescription className="mt-1">
                {t("Monthly revenue from synced orders", "الأرباح الشهرية من الطلبات المتزامنة")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {revenueData.length > 0 ? (
              <ChartContainer config={revenueChartConfig} className="h-[260px] w-full">
                <AreaChart data={revenueData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} formatter={(value) => [`$${Number(value).toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2.5} fill="url(#revenueGradient)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                {t("Revenue charts will appear once orders are received", "ستظهر رسوم الأرباح بمجرد استلام الطلبات")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Donut */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">{t("Sales by Category", "المبيعات حسب الفئة")}</CardTitle>
            <CardDescription>{t("Revenue distribution from synced data", "توزيع الأرباح من البيانات المتزامنة")}</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <>
                <ChartContainer config={{ category: { label: "Category" } }} className="mx-auto h-[200px] w-full">
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}%`, ""]} contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                  </PieChart>
                </ChartContainer>
                <div className="mt-3 space-y-2">
                  {categoryData.map((cat) => (
                    <div key={cat.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="size-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                        <span className="text-muted-foreground">{cat.name}</span>
                      </div>
                      <span className="font-medium tabular-nums">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                {t("Category breakdown will appear after sync", "سيظهر تفصيل الفئات بعد المزامنة")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Orders Bar */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">{t("Weekly Orders", "طلبات الأسبوع")}</CardTitle>
            <CardDescription>{t("Orders received this week", "الطلبات المستلمة هذا الأسبوع")}</CardDescription>
          </CardHeader>
          <CardContent>
            {weeklyOrders.length > 0 ? (
              <ChartContainer config={ordersChartConfig} className="h-[180px] w-full">
                <BarChart data={weeklyOrders} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                {t("Order trends will appear once orders are received", "ستظهر اتجاهات الطلبات بمجرد استلام الطلبات")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders - spans 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <div>
              <CardTitle className="text-base">{t("Recent Orders", "أحدث الطلبات")}</CardTitle>
              <CardDescription>{t("Latest orders from Noon webhooks", "أحدث الطلبات من خطافات نون")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentOrders.length > 0 ? (
              <div className="divide-y divide-border">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium text-foreground">
                          {order.noon_order_id ?? order.id.slice(0, 8)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {order.order_date ? new Date(order.order_date).toLocaleString() : "—"}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-sm font-semibold tabular-nums sm:block">
                      {order.displayTotal > 0 ? `${order.displayTotal.toFixed(2)}` : "—"}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        statusBadgeClass(order.displayStatus)
                      )}
                    >
                      {order.displayStatus}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                {t("Orders will appear here once Noon sends webhook events", "ستظهر الطلبات هنا بمجرد إرسال نون لأحداث الويبهوك")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
