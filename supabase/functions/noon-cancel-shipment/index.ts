import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_CANCEL_SHIPMENT_URL =
  "https://noon-api-gateway.noon.partners/fbpi/v1/shipment/cancel"

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

async function callNoonCancelShipment(
  cookie: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; statusText: string; text: string; body: unknown }> {
  const response = await fetch(NOON_CANCEL_SHIPMENT_URL, {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as {
      warehouse_code?: string
      integration_shipment_nr?: string
    }

    const warehouseCode =
      typeof parsed.warehouse_code === "string" ? parsed.warehouse_code.trim() : ""
    const integrationShipmentNr =
      typeof parsed.integration_shipment_nr === "string" ? parsed.integration_shipment_nr.trim() : ""

    if (!warehouseCode) {
      return new Response(
        JSON.stringify({ ok: false, error: "`warehouse_code` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
    if (!integrationShipmentNr) {
      return new Response(
        JSON.stringify({ ok: false, error: "`integration_shipment_nr` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const payload = {
      warehouse_code: warehouseCode,
      integration_shipment_nr: integrationShipmentNr,
    }

    // 1. Call the Noon CancelShipment API.
    const cookie = await getSessionCookie(false)
    let result = await callNoonCancelShipment(cookie, payload)

    if (result.status === 401) {
      const freshCookie = await getSessionCookie(true)
      result = await callNoonCancelShipment(freshCookie, payload)
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

    // 2. Update the local database: revert the order and its items.
    // Find the order by integration_shipment_nr.
    const { data: orderData, error: orderLookupError } = await supabase
      .from("orders")
      .select("fbpi_order_nr")
      .eq("integration_shipment_nr", integrationShipmentNr)
      .maybeSingle()

    if (orderLookupError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Noon accepted the cancellation but the local order lookup failed: ${orderLookupError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const fbpiOrderNr = (orderData as { fbpi_order_nr?: string } | null)?.fbpi_order_nr ?? null

    if (fbpiOrderNr) {
      // Revert all line items for this order to CANCELLED.
      const { error: itemsError } = await supabase
        .from("order_items")
        .update({ integration_status: "CANCELLED" })
        .eq("fbpi_order_nr", fbpiOrderNr)

      if (itemsError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Noon accepted the cancellation but the local item update failed: ${itemsError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        )
      }

      // Revert the order to CANCELLED and clear the shipment references.
      const { error: orderUpdateError } = await supabase
        .from("orders")
        .update({
          status: "CANCELLED",
          awb_nr: null,
          integration_shipment_nr: null,
        })
        .eq("fbpi_order_nr", fbpiOrderNr)

      if (orderUpdateError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Noon accepted the cancellation but the local order update failed: ${orderUpdateError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        )
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          integration_shipment_nr: integrationShipmentNr,
          fbpi_order_nr: fbpiOrderNr,
          status: "CANCELLED",
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
