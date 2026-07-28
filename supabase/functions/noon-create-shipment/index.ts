import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_CREATE_SHIPMENT_URL =
  "https://noon-api-gateway.noon.partners/fbpi/v1/shipment/create"

const USER_AGENT = "NexCommerce/1.0.0"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

async function getSessionCookie(force = false): Promise<string> {
  const authUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/noon-auth`
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ force }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Noon auth failed (${response.status}): ${text || response.statusText}`)
  }

  const data = (await response.json()) as { ok: boolean; cookie?: string; error?: string }
  if (!data.ok || !data.cookie) {
    throw new Error(`Noon auth failed: ${data.error ?? "no cookie returned"}`)
  }

  return data.cookie
}

const NOON_SUCCESS_STATUS_CODES = new Set([
  "ok", "success", "successful", "succeeded", "completed", "200", "true",
])

function extractNoonError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const obj = body as Record<string, unknown>

  const status = obj.status
  if (status && typeof status === "object") {
    const s = status as Record<string, unknown>
    const code =
      typeof s.status_code === "string" ? s.status_code :
      typeof s.code === "string" ? s.code : ""
    if (code && !NOON_SUCCESS_STATUS_CODES.has(code.toLowerCase())) {
      const msg =
        typeof s.message === "string" ? s.message :
        typeof s.description === "string" ? s.description :
        typeof s.detail === "string" ? s.detail : ""
      return msg ? `Noon API Error [${code}]: ${msg}` : `Noon API Error [${code}]`
    }
  }

  if (typeof status === "string" && !NOON_SUCCESS_STATUS_CODES.has(status.toLowerCase())) {
    return `Noon API Error: ${status}`
  }

  if (typeof obj.error === "string" && obj.error.trim() !== "") {
    return obj.error
  }

  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    const first = obj.errors[0]
    const msg =
      typeof first === "string" ? first :
      (first && typeof first === "object" && typeof (first as Record<string, unknown>).message === "string")
        ? String((first as Record<string, unknown>).message)
        : JSON.stringify(first)
    return `Noon API Error: ${msg}`
  }

  return null
}

async function callNoonCreateShipment(
  cookie: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; statusText: string; text: string; body: unknown }> {
  const response = await fetch(NOON_CREATE_SHIPMENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(payload),
  })

  const textBody = await response.text()
  let body: unknown
  try {
    body = JSON.parse(textBody)
  } catch {
    body = textBody
  }

  return { ok: response.ok, status: response.status, statusText: response.statusText, text: textBody, body }
}

function generateIntegrationShipmentNr(): string {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1_000_000)
  return `SHIP-${timestamp}-${random}`
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as {
      warehouse_code?: string
      fbpi_order_nr?: string
      items?: string[]
      awb_nr?: string
    }

    const warehouseCode =
      typeof parsed.warehouse_code === "string" ? parsed.warehouse_code.trim() : ""
    const fbpiOrderNr =
      typeof parsed.fbpi_order_nr === "string" ? parsed.fbpi_order_nr.trim() : ""
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter((i): i is string => typeof i === "string" && i.trim() !== "").map((i) => i.trim())
      : []
    const awbNrInput =
      typeof parsed.awb_nr === "string" ? parsed.awb_nr.trim() : ""

    if (!warehouseCode) {
      return new Response(
        JSON.stringify({ ok: false, error: "`warehouse_code` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
    if (!fbpiOrderNr) {
      return new Response(
        JSON.stringify({ ok: false, error: "`fbpi_order_nr` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
    if (items.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "`items` must contain at least one `mp_item_nr`." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const integrationShipmentNr = generateIntegrationShipmentNr()
    const awbNr = awbNrInput || `AWB-${Math.floor(Math.random() * 1_000_000)}`

    const payload = {
      warehouse_code: warehouseCode,
      integration_shipment_nr: integrationShipmentNr,
      fbpi_order_nr: fbpiOrderNr,
      awbs: [
        {
          courier: "noon",
          awb_nr: awbNr,
        },
      ],
      items: items.map((mp_item_nr) => ({ mp_item_nr })),
    }

    // 1. Call the Noon CreateShipment API.
    const cookie = await getSessionCookie(false)
    let result = await callNoonCreateShipment(cookie, payload)

    if (result.status === 401) {
      const freshCookie = await getSessionCookie(true)
      result = await callNoonCreateShipment(freshCookie, payload)
    }

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Noon API Error [${result.status} ${result.statusText}]: ${result.text || "Empty Body"}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const bodyError = extractNoonError(result.body)
    if (bodyError) {
      return new Response(
        JSON.stringify({ ok: false, error: bodyError }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    // 2. Update the local database: mark the shipped items and the order.
    const { error: itemsError } = await supabase
      .from("order_items")
      .update({ integration_status: "SHIPPED" })
      .in("mp_item_nr", items)
      .eq("fbpi_order_nr", fbpiOrderNr)

    if (itemsError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Noon accepted the shipment but the local item update failed: ${itemsError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const { error: orderError } = await supabase
      .from("orders")
      .update({ status: "SHIPPED", awb_nr: awbNr })
      .eq("fbpi_order_nr", fbpiOrderNr)

    if (orderError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Noon accepted the shipment but the local order update failed: ${orderError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          fbpi_order_nr: fbpiOrderNr,
          integration_shipment_nr: integrationShipmentNr,
          awb_nr: awbNr,
          items,
          status: "SHIPPED",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
