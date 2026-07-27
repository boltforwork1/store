import { AlertTriangle, ArrowUpDown, Download, Package2, Warehouse } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const warehouses = [
  { name: "East Coast Hub", location: "Newark, NJ", capacity: 10000, used: 7840, items: 284 },
  { name: "West Coast Hub", location: "Los Angeles, CA", capacity: 8000, used: 5120, items: 196 },
  { name: "Midwest DC", location: "Chicago, IL", capacity: 6000, used: 2100, items: 97 },
  { name: "Southern Depot", location: "Atlanta, GA", capacity: 4000, used: 3600, items: 142 },
]

const inventory = [
  { sku: "SKU-1001", name: "Wireless Headphones Pro", warehouse: "East Coast Hub", qty: 142, reserved: 18, threshold: 20, value: "$42,358" },
  { sku: "SKU-1002", name: "Ergonomic Chair Elite", warehouse: "West Coast Hub", qty: 38, reserved: 5, threshold: 15, value: "$20,862" },
  { sku: "SKU-1003", name: "Standing Desk Converter", warehouse: "East Coast Hub", qty: 5, reserved: 3, threshold: 10, value: "$945" },
  { sku: "SKU-1004", name: "4K USB-C Monitor", warehouse: "Midwest DC", qty: 0, reserved: 0, threshold: 5, value: "$0" },
  { sku: "SKU-1005", name: "Mechanical Keyboard TKL", warehouse: "East Coast Hub", qty: 89, reserved: 12, threshold: 25, value: "$11,481" },
  { sku: "SKU-1006", name: "Premium Laptop Backpack", warehouse: "Southern Depot", qty: 201, reserved: 30, threshold: 40, value: "$17,889" },
  { sku: "SKU-1007", name: "Dual Monitor Arm", warehouse: "West Coast Hub", qty: 12, reserved: 8, threshold: 15, value: "$1,788" },
  { sku: "SKU-1008", name: "Smart LED Desk Lamp", warehouse: "Midwest DC", qty: 0, reserved: 0, threshold: 10, value: "$0" },
]

function getStockLevel(qty: number, threshold: number) {
  if (qty === 0) return { label: "Out of Stock", color: "text-red-600 dark:text-red-400", bar: "bg-red-500" }
  if (qty < threshold) return { label: "Low Stock", color: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" }
  return { label: "In Stock", color: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" }
}

export function InventoryPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Inventory Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time stock levels across all warehouses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="size-3.5" />
            Export
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowUpDown className="size-3.5" />
            Reorder
          </Button>
        </div>
      </div>

      {/* Warehouse Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {warehouses.map((wh) => {
          const pct = Math.round((wh.used / wh.capacity) * 100)
          return (
            <Card key={wh.name}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Warehouse className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">{wh.name}</CardTitle>
                    <CardDescription className="text-xs">{wh.location}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-end justify-between text-sm">
                  <span className="text-muted-foreground">Capacity</span>
                  <span className="font-semibold tabular-nums">
                    {wh.used.toLocaleString()} / {wh.capacity.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={cn(
                    "h-1.5",
                    pct > 90 ? "[&>div]:bg-red-500" : pct > 70 ? "[&>div]:bg-amber-500" : ""
                  )}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{pct}% utilized</span>
                  <span className="flex items-center gap-1">
                    <Package2 className="size-3" />
                    {wh.items} SKUs
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Low stock alert */}
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-amber-700 dark:text-amber-300">
          <span className="font-semibold">3 items</span> are below their reorder threshold and require attention.
        </p>
        <Button variant="outline" size="sm" className="ml-auto shrink-0 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300">
          Review
        </Button>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Stock Levels</CardTitle>
          <CardDescription>All SKUs with current inventory and thresholds</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.map((item) => {
                const level = getStockLevel(item.qty, item.threshold)
                return (
                  <TableRow key={item.sku} className="hover:bg-muted/30">
                    <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                      {item.sku}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {item.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.warehouse}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{item.qty}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.reserved}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{item.value}</TableCell>
                    <TableCell className="pr-6">
                      <span className={cn("text-xs font-medium", level.color)}>
                        {level.label}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
