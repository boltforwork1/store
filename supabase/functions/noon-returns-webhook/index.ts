import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

// Per the Noon Partner API spec, ALL requests must include a User-Agent header
// identifying the application. Requests without it may be rejected.
const USER_AGENT = "NexCommerce/1.0.0"

const NOON_RETURNS_LIST_URL =
  "https://noon-api-gateway.noon.partners/returns/v1/return-references/list"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

type NoonReturnItem = {
  mp_code?: string
  purchase_item_nr?: string
  partner_sku?: string
  merchant_code?: string
  [key: string]: unknown
}

type NoonReturnsResponse = {
  items?: NoonReturnItem[]
  [key: string]: unknown
}

/**
 * Fetch a valid Noon session cookie from the noon-auth edge function. When
 * `force` is true the cached cookie is invalidated and a fresh login is
 * performed — used to recover from a 401 during the returns call.
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

/**
 * Call the Noon return-references/list endpoint with the session cookie.
 * The body sent to Noon is exactly `{ "barcode": "<barcode>" }` —
 * merchant_codes is intentionally omitted per the official docs.
 */
async function callNoonReturnsList(
  cookie: string,
  barcode: string
): Promise<{ ok: boolean; status: number; statusText: string; text: string; body: unknown }> {
  const response = await fetch(NOON_RETURNS_LIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ barcode }),
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

/**
 * Call the Noon returns list endpoint, transparently re-authenticating once on
 * 401. Returns the parsed response body.
 */
async function callNoonWithRetry(barcode: string): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  let result = await callNoonReturnsList(cookie, barcode)

  if (result.status === 401) {
    const freshCookie = await getSessionCookie(true)
    result = await callNoonReturnsList(freshCookie, barcode)
  }

  if (!result.ok) {
    throw new Error(
      `Noon API Error [${result.status} ${result.statusText}]: ${result.text || "Empty Body"}`
    )
  }

  const bodyError = extractNoonError(result.body)
  if (bodyError) {
    throw new Error(bodyError)
  }

  return result.body
}

/**
 * Extract the `items` array from a Noon returns-list response. The array may be
 * at the top level or nested under `data`/`result`.
 */
function extractItems(body: unknown): NoonReturnItem[] {
  if (!body || typeof body !== "object") return []
  const obj = body as Record<string, unknown>

  const candidates: unknown[] = [
    obj.items,
    (obj.data as Record<string, unknown>)?.items,
    (obj.result as Record<string, unknown>)?.items,
  ]
  for (const c of candidates) {
    if (Array.isArray(c)) return c as NoonReturnItem[]
  }
  return []
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  // Always acknowledge the webhook with 200 OK so Noon does not retry.
  const ack = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  try {
    const parsed = (await req.json().catch(() => ({}))) as { barcode?: unknown }

    // 1. Extract the barcode from the incoming webhook POST body.
    const rawBarcode = parsed.barcode
    if (typeof rawBarcode !== "string" || rawBarcode.trim() === "") {
      // No barcode — still acknowledge so Noon stops retrying.
      return ack({ ok: false, error: "barcode is required" })
    }
    const barcode = rawBarcode.trim()

    // 2. Upsert the parent return row (idempotent on barcode).
    const { data: returnRow, error: returnError } = await supabase
      .from("returns")
      .upsert(
        { barcode },
        { onConflict: "barcode" }
      )
      .select("id")
      .single()

    if (returnError || !returnRow) {
      console.error(`Failed to upsert return for barcode ${barcode}: ${returnError?.message}`)
      return ack({ ok: false, error: "failed to store return" })
    }

    const returnId = returnRow.id

    // 3. Call the Noon returns list endpoint with exactly { "barcode": "<barcode>" }.
    const responseBody = await callNoonWithRetry(barcode) as NoonReturnsResponse

    // 4. Parse the items array and insert into return_items.
    const items = extractItems(responseBody)

    if (items.length > 0) {
      const rows = items.map((item) => ({
        return_id: returnId,
        mp_code: typeof item.mp_code === "string" ? item.mp_code : null,
        purchase_item_nr:
          typeof item.purchase_item_nr === "string" ? item.purchase_item_nr
          : item.purchase_item_nr != null ? String(item.purchase_item_nr) : null,
        partner_sku: typeof item.partner_sku === "string" ? item.partner_sku : null,
        merchant_code: typeof item.merchant_code === "string" ? item.merchant_code : null,
      }))

      const { error: itemsError } = await supabase
        .from("return_items")
        .insert(rows)

      if (itemsError) {
        console.error(
          `Failed to insert return_items for barcode ${barcode}: ${itemsError.message}`
        )
        // The return row was stored; items failed. Still ack 200 so Noon
        // doesn't retry, but surface the issue in the response body.
        return ack({ ok: true, warning: "return stored but items insert failed", item_count: 0 })
      }

      // Sync the returned items back to the existing order_items table.
      // The Noon return-references response carries `purchase_item_nr`, which
      // corresponds to `mp_item_nr` on the original order line item. Mark each
      // matching order item as RETURNED so the unified Orders view reflects the
      // return without a separate Returns page.
      const purchaseItemNrs = rows
        .map((r) => r.purchase_item_nr)
        .filter((nr): nr is string => nr !== null)

      let syncedCount = 0
      if (purchaseItemNrs.length > 0) {
        const { error: syncError } = await supabase
          .from("order_items")
          .update({ integration_status: "RETURNED" })
          .in("mp_item_nr", purchaseItemNrs)

        if (syncError) {
          console.error(
            `Failed to sync returned items to order_items for barcode ${barcode}: ${syncError.message}`
          )
        } else {
          syncedCount = purchaseItemNrs.length
        }
      }
    }

    // 5. Always return 200 OK to acknowledge the webhook.
    return ack({ ok: true, barcode, item_count: items.length })
  } catch (err) {
    // Even on unexpected errors we acknowledge with 200 so Noon does not
    // retry indefinitely. The error is logged and surfaced in the body.
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error(`noon-returns-webhook error: ${message}`)
    return ack({ ok: false, error: message })
  }
})
