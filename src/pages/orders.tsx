import { useState } from "react"
import { Search, Filter, Download, Eye, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const orders = [
  { id: "#4521", customer: "Acme Corp", email: "billing@acme.com", items: 3, total: "$1,240.00", payment: "Credit Card", status: "Completed", date: "Dec 15, 2024", channel: "Web" },
  { id: "#4520", customer: "Blue Ocean LLC", email: "orders@blueocean.io", items: 1, total: "$890.00", payment: "Wire Transfer", status: "Processing", date: "Dec 15, 2024", channel: "API" },
  { id: "#4519", customer: "Stark Industries", email: "tony@stark.com", items: 2, total: "$2,100.00", payment: "Credit Card", status: "Shipped", date: "Dec 14, 2024", channel: "Web" },
  { id: "#4518", customer: "Wayne Enterprises", email: "finance@wayne.com", items: 1, total: "$340.00", payment: "PayPal", status: "Completed", date: "Dec 14, 2024", channel: "Mobile" },
  { id: "#4517", customer: "Initech", email: "peter@initech.com", items: 4, total: "$128.00", payment: "Credit Card", status: "Pending", date: "Dec 14, 2024", channel: "Web" },
  { id: "#4516", customer: "Globex Corp", email: "orders@globex.com", items: 2, total: "$3,400.00", payment: "Wire Transfer", status: "Shipped", date: "Dec 13, 2024", channel: "API" },
  { id: "#4515", customer: "Soylent Corp", email: "b2b@soylent.co", items: 10, total: "$5,800.00", payment: "Credit Card", status: "Completed", date: "Dec 13, 2024", channel: "Web" },
  { id: "#4514", customer: "Umbrella Corp", email: "supply@umbrella.com", items: 6, total: "$780.00", payment: "Credit Card", status: "Cancelled", date: "Dec 12, 2024", channel: "Mobile" },
  { id: "#4513", customer: "Hooli Inc", email: "procurement@hooli.com", items: 2, total: "$1,598.00", payment: "Wire Transfer", status: "Completed", date: "Dec 12, 2024", channel: "API" },
  { id: "#4512", customer: "Pied Piper", email: "ops@piedpiper.com", items: 1, total: "$299.00", payment: "Credit Card", status: "Refunded", date: "Dec 11, 2024", channel: "Web" },
]

const STATUS_STYLES: Record<string, string> = {
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  Processing: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Shipped: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300",
  Pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Cancelled: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-300",
  Refunded: "bg-muted text-muted-foreground border-border",
}

const statusCounts = {
  all: orders.length,
  pending: orders.filter((o) => o.status === "Pending").length,
  processing: orders.filter((o) => o.status === "Processing").length,
  shipped: orders.filter((o) => o.status === "Shipped").length,
  completed: orders.filter((o) => o.status === "Completed").length,
}

const tabs = [
  { label: "All Orders", value: "all", count: statusCounts.all },
  { label: "Pending", value: "Pending", count: statusCounts.pending },
  { label: "Processing", value: "Processing", count: statusCounts.processing },
  { label: "Shipped", value: "Shipped", count: statusCounts.shipped },
  { label: "Completed", value: "Completed", count: statusCounts.completed },
]

export function OrdersPage() {
  const [activeTab, setActiveTab] = useState("all")

  const filtered = activeTab === "all" ? orders : orders.filter((o) => o.status === activeTab)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Orders</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orders.length} total orders · 3 require action
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              activeTab === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                activeTab === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted-foreground/15 text-muted-foreground"
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search orders, customers…" className="pl-9 bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <Select defaultValue="all-time">
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-time">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="size-3.5" />
            Filter
          </Button>
        </div>
      </div>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 w-20">Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Channel</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => (
                <TableRow key={order.id} className="hover:bg-muted/30">
                  <TableCell className="pl-6 font-mono text-sm font-medium">
                    {order.id}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{order.customer}</p>
                      <p className="text-xs text-muted-foreground">{order.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {order.channel}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right text-sm text-muted-foreground tabular-nums">
                    {order.items}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {order.total}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {order.date}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        STATUS_STYLES[order.status]
                      )}
                    >
                      {order.status}
                    </span>
                  </TableCell>
                  <TableCell className="pr-6">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" className="rounded-md">
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="size-3.5 mr-2" />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem>Mark as shipped</DropdownMenuItem>
                        <DropdownMenuItem>Print invoice</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                          Cancel order
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {orders.length} orders
          </p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" disabled>
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="px-2 text-xs font-medium">1 / 1</span>
            <Button variant="ghost" size="icon-xs" disabled>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
