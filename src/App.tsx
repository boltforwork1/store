import { Routes, Route, Navigate } from "react-router-dom"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { OverviewPage } from "@/pages/overview"
import { ProductsPage } from "@/pages/products"
import { InventoryPage } from "@/pages/inventory"
import { OrdersPage } from "@/pages/orders"
import { SettingsPage } from "@/pages/settings"
import { LoginPage } from "@/pages/login"
import { AccountingPage } from "@/pages/accounting"
import { InternalStockPage } from "@/pages/internal-stock"

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="internal-stock" element={<InternalStockPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}

export default App
