import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Star,
  TrendingUp,
  Package,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const products = [
  { id: "SKU-1001", name: "Wireless Noise-Cancelling Headphones", category: "Electronics", price: "$299", stock: 142, status: "Active", rating: 4.8, sales: 1204 },
  { id: "SKU-1002", name: "Ergonomic Mesh Office Chair", category: "Furniture", price: "$549", stock: 38, status: "Active", rating: 4.6, sales: 876 },
  { id: "SKU-1003", name: "Portable Standing Desk Converter", category: "Furniture", price: "$189", stock: 5, status: "Low Stock", rating: 4.4, sales: 543 },
  { id: "SKU-1004", name: "4K USB-C Monitor 27\"", category: "Electronics", price: "$649", stock: 0, status: "Out of Stock", rating: 4.9, sales: 2100 },
  { id: "SKU-1005", name: "Mechanical Keyboard TKL", category: "Electronics", price: "$129", stock: 89, status: "Active", rating: 4.7, sales: 3241 },
  { id: "SKU-1006", name: "Premium Laptop Backpack", category: "Accessories", price: "$89", stock: 201, status: "Active", rating: 4.5, sales: 1890 },
  { id: "SKU-1007", name: "Dual Monitor Arm Stand", category: "Accessories", price: "$149", stock: 12, status: "Low Stock", rating: 4.3, sales: 412 },
  { id: "SKU-1008", name: "Smart LED Desk Lamp", category: "Electronics", price: "$79", stock: 0, status: "Discontinued", rating: 4.1, sales: 654 },
]

const CATEGORY_COLORS: Record<string, string> = {
  Electronics: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  Furniture: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  Accessories: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300",
}

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  "Low Stock": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  "Out of Stock": "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-300",
  Discontinued: "bg-muted text-muted-foreground border-border",
}

export function ProductsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Product Catalog</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {products.length} products across all categories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="size-3.5" />
            Filter
          </Button>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-3.5" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, SKU, category…"
          className="pl-9 bg-background"
        />
      </div>

      {/* Product Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {products.map((product) => (
          <Card key={product.id} className="group relative overflow-hidden transition-shadow hover:shadow-md">
            {/* Product thumbnail placeholder */}
            <div className="flex h-36 items-center justify-center bg-muted/50">
              <Package className="size-12 text-muted-foreground/30" />
            </div>
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{product.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground font-mono">{product.id}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit product</DropdownMenuItem>
                    <DropdownMenuItem>Duplicate</DropdownMenuItem>
                    <DropdownMenuItem>View analytics</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-1.5 mb-3">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    CATEGORY_COLORS[product.category] ?? "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {product.category}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    STATUS_STYLES[product.status]
                  )}
                >
                  {product.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">{product.price}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {product.rating}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <TrendingUp className="size-3" />
                    {product.sales.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {product.stock > 0 ? `${product.stock} in stock` : "No stock"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
