export type Product = {
  id: string
  partner_sku: string
  name: string
  price: number
  msrp: number
  stock_qty: number
  delivery_mode: string
  is_active: boolean
}

export type OrderStatus = "Pending" | "Acknowledged" | "Shipped"

export type Order = {
  id: string
  noon_order_id: string
  order_date: string
  total_price: number
  status: string
}

export type Settings = {
  id: string
  noon_api_key: string | null
  noon_key_id: string | null
  noon_private_key: string | null
  warehouse_code: string | null
  country_code: string | null
  webhook_api_key: string | null
}
