import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_BASE = "https://noon-api-gateway.noon.partners"
const NOON_STOCK_UPDATE_URL = `${NOON_BASE}/stock/v1/stock-update`

// Per the Noon Partner API spec, ALL requests must include a User-Agent header
// identifying the application. Requests without it may be rejected.
const USER_AGENT = "NexCommerce/1.0.0"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

type StockItem = {
  warehouse_code: string
  partner_sku: string
  qty: number
}

type StockRequestBody = {
  items: StockItem[]
}

/**
 * Fetch a valid Noon session cookie from the noon-auth edge function. When
 * `force` is true the cached cookie is invalidated and a fresh login is
 * performed — used to recover from a 401 during a stock update call.
 */
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

/**
 * Call the Noon stock-update endpoint with the session cookie. Returns the
 * parsed JSON body and the HTTP status. If Noon responds with 401 the caller
 * can retry after forcing a re-authentication.
 */
async function callNoonStockUpdate(
  cookie: string,
  payload: StockRequestBody
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(NOON_STOCK_UPDATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  return { status: response.status, body }
}

/**
 * Call the Noon stock-update endpoint, transparently re-authenticating once
 * on 401. Returns the parsed response body.
 */
async function callNoonWithRetry(payload: StockRequestBody): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  const first = await callNoonStockUpdate(cookie, payload)

  if (first.status === 401) {
    const freshCookie = await getSessionCookie(true)
    const retry = await callNoonStockUpdate(freshCookie, payload)

    if (retry.status !== 200) {
      throw new Error(
        `Noon stock update failed after re-auth (${retry.status}): ${JSON.stringify(retry.body)}`
      )
    }

    return retry.body
  }

  if (first.status !== 200) {
    throw new Error(
      `Noon stock update failed (${first.status}): ${JSON.stringify(first.body)}`
    )
  }

  return first.body
}

/**
 * Validate the incoming request body. Returns a typed payload or throws.
 */
function validateBody(body: unknown): StockRequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object")
  }
  const { items } = body as { items?: unknown }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("`items` must be a non-empty array")
  }

  const normalized: StockItem[] = items.map((raw, idx) => {
    const item = raw as Partial<StockItem>
    if (!item.warehouse_code || typeof item.warehouse_code !== "string") {
      throw new Error(`items[${idx}].warehouse_code must be a non-empty string`)
    }
    if (!item.partner_sku || typeof item.partner_sku !== "string") {
      throw new Error(`items[${idx}].partner_sku must be a non-empty string`)
    }
    const qty = Number(item.qty)
    if (!Number.isFinite(qty) || qty < 0) {
      throw new Error(`items[${idx}].qty must be a non-negative number`)
    }
    return {
      warehouse_code: item.warehouse_code.trim(),
      partner_sku: item.partner_sku.trim(),
      qty,
    }
  })

  return { items: normalized }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = await req.json().catch(() => ({}))
    const payload = validateBody(parsed)

    const responseBody = await callNoonWithRetry(payload)

    // Noon's stock-update response contains an `items` array, each with a
    // `status.status_code` of "OK" on success. We surface the raw body so the
    // frontend can inspect per-item results and show appropriate toasts.
    return new Response(
      JSON.stringify({ ok: true, data: responseBody }),
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
