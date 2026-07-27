import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
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
import { cn } from "@/lib/utils"

const revenueData = [
  { month: "Jan", revenue: 42000, orders: 320 },
  { month: "Feb", revenue: 38000, orders: 290 },
  { month: "Mar", revenue: 51000, orders: 410 },
  { month: "Apr", revenue: 47000, orders: 370 },
  { month: "May", revenue: 63000, orders: 490 },
  { month: "Jun", revenue: 58000, orders: 450 },
  { month: "Jul", revenue: 72000, orders: 560 },
  { month: "Aug", revenue: 68000, orders: 520 },
  { month: "Sep", revenue: 79000, orders: 610 },
  { month: "Oct", revenue: 85000, orders: 670 },
  { month: "Nov", revenue: 91000, orders: 720 },
  { month: "Dec", revenue: 98000, orders: 780 },
]

const categoryData = [
  { name: "Electronics", value: 35, color: "var(--chart-1)" },
  { name: "Apparel", value: 25, color: "var(--chart-2)" },
  { name: "Home & Garden", value: 20, color: "var(--chart-3)" },
  { name: "Sports", value: 12, color: "var(--chart-4)" },
  { name: "Other", value: 8, color: "var(--chart-5)" },
]

const weeklyOrders = [
  { day: "Mon", orders: 45 },
  { day: "Tue", orders: 62 },
  { day: "Wed", orders: 58 },
  { day: "Thu", orders: 71 },
  { day: "Fri", orders: 89 },
  { day: "Sat", orders: 54 },
  { day: "Sun", orders: 38 },
]

const recentOrders = [
  { id: "#4521", customer: "Acme Corp", product: "Wireless Headphones", amount: "$1,240", status: "Completed", time: "2m ago" },
  { id: "#4520", customer: "Blue Ocean LLC", product: "Ergonomic Chair", amount: "$890", status: "Processing", time: "14m ago" },
  { id: "#4519", customer: "Stark Industries", product: "Standing Desk", amount: "$2,100", status: "Shipped", time: "1h ago" },
  { id: "#4518", customer: "Wayne Enterprises", product: "Monitor Arm", amount: "$340", status: "Completed", time: "3h ago" },
  { id: "#4517", customer: "Initech", product: "USB-C Hub", amount: "$128", status: "Pending", time: "5h ago" },
]

const STATUS_STYLES: Record<string, string> = {
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  Processing: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Shipped: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300",
  Pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
}

const kpis = [
  {
    title: "Total Revenue",
    value: "$98,240",
    change: "+14.2%",
    trend: "up",
    icon: DollarSign,
    description: "vs last month",
  },
  {
    title: "Total Orders",
    value: "3,842",
    change: "+8.7%",
    trend: "up",
    icon: ShoppingCart,
    description: "vs last month",
  },
  {
    title: "Active Products",
    value: "1,294",
    change: "-2.1%",
    trend: "down",
    icon: Package,
    description: "vs last month",
  },
  {
    title: "New Customers",
    value: "486",
    change: "+21.3%",
    trend: "up",
    icon: Users,
    description: "vs last month",
  },
]

const revenueChartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-2)" },
}

const ordersChartConfig = {
  orders: { label: "Orders", color: "var(--chart-1)" },
}

export function OverviewPage() {
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
                    <span className="text-xs text-muted-foreground">{kpi.description}</span>
                  </div>
                </div>
                {kpi.trend === "up" ? (
                  <TrendingUp className="size-8 text-emerald-500/20" />
                ) : (
                  <TrendingDown className="size-8 text-red-400/20" />
                )}
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
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">Revenue Overview</CardTitle>
                <CardDescription className="mt-1">
                  Monthly revenue for the current year
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon-sm" className="rounded-lg">
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={revenueChartConfig} className="h-[260px] w-full">
              <AreaChart data={revenueData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2.5}
                  fill="url(#revenueGradient)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Category Donut */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Sales by Category</CardTitle>
            <CardDescription>Revenue distribution this month</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ category: { label: "Category" } }}
              className="mx-auto h-[200px] w-full"
            >
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value}%`, ""]}
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ChartContainer>
            <div className="mt-3 space-y-2">
              {categoryData.map((cat) => (
                <div key={cat.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-2.5 rounded-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-muted-foreground">{cat.name}</span>
                  </div>
                  <span className="font-medium tabular-nums">{cat.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Orders Bar */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Weekly Orders</CardTitle>
            <CardDescription>Orders placed this week</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={ordersChartConfig} className="h-[180px] w-full">
              <BarChart data={weeklyOrders} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="orders"
                  fill="var(--color-orders)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Recent Orders - spans 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Orders</CardTitle>
                <CardDescription>Latest transactions across all channels</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="text-xs">
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium text-foreground">
                        {order.id}
                      </span>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        · {order.customer}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {order.product}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-sm font-semibold tabular-nums sm:block">
                    {order.amount}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      STATUS_STYLES[order.status]
                    )}
                  >
                    {order.status}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{order.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
