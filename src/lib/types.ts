export type Product = {
  id: string
  partner_sku: string
  name: string
  price: number
  msrp: number
  stock_qty: number
  delivery_mode: string
  is_active: boolean
  image_url: string | null
}

export type OrderStatus = "Pending" | "Acknowledged" | "Shipped"

export type Order = {
  id: string
  noon_order_id: string | null
  fbpi_order_nr: string | null
  mp_order_nr: string | null
  warehouse_code: string | null
  order_date: string | null
  order_created_at: string | null
  total_price: number | null
  status: string | null
  customer_country_code: string | null
  awb_nr: string | null
}

export type OrderItem = {
  mp_item_nr: string
  fbpi_order_nr: string
  partner_sku: string | null
  mp_status: string | null
  integration_status: string | null
  price: number | null
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
