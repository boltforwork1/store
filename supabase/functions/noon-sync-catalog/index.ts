import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_BASE = "https://noon-api-gateway.noon.partners"
const NOON_EXPORT_CREATE_URL = `${NOON_BASE}/catalog/v1/export/create`
const NOON_EXPORT_STATUS_URL = `${NOON_BASE}/catalog/v1/export/status`

// Per the Noon Partner API spec, ALL requests must include a User-Agent header
// identifying the application. Requests without it may be rejected.
const USER_AGENT = "NexCommerce/1.0.0"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

type CachedCookie = {
  cookie: string
  expires_at: string | null
  updated_at: string
}

/**
 * Fetch a valid Noon session cookie from the noon-auth edge function. When
 * `force` is true the cached cookie is invalidated and a fresh login is
 * performed — used to recover from a 401 during an export call.
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
 * Call a Noon export endpoint with the session cookie. Returns the parsed JSON
 * body and the HTTP status. If Noon responds with 401 the caller can retry
 * after forcing a re-authentication.
 */
async function callNoonExport(
  url: string,
  cookie: string,
  payload: unknown
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
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
 * Call a Noon export endpoint, transparently re-authenticating once on 401.
 */
async function callNoonWithRetry(
  url: string,
  payload: unknown
): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  const first = await callNoonExport(url, cookie, payload)

  if (first.status === 401) {
    const freshCookie = await getSessionCookie(true)
    const retry = await callNoonExport(url, freshCookie, payload)

    if (retry.status !== 200) {
      throw new Error(
        `Noon export call failed after re-auth (${retry.status}): ${JSON.stringify(retry.body)}`
      )
    }

    return retry.body
  }

  if (first.status !== 200) {
    throw new Error(
      `Noon export call failed (${first.status}): ${JSON.stringify(first.body)}`
    )
  }

  return first.body
}

/**
 * Trigger a product catalog export on Noon. Returns the export_code Noon
 * assigned to the job, used to poll status afterwards.
 */
async function createExport(): Promise<string> {
  const body = await callNoonWithRetry(NOON_EXPORT_CREATE_URL, {
    export_category_code: "product",
    params: {},
  })

  const exportCode = (body as { export_code?: string })?.export_code
  if (!exportCode) {
    throw new Error(`Noon export/create did not return an export_code: ${JSON.stringify(body)}`)
  }

  return exportCode
}

/**
 * Poll Noon for the status of an export job. Returns the download_url once the
 * export is complete. Throws if the export fails or polling times out.
 */
async function pollExportStatus(exportCode: string): Promise<string> {
  const maxAttempts = 30
  const intervalMs = 5000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const body = await callNoonWithRetry(NOON_EXPORT_STATUS_URL, {
      export_code: exportCode,
    })

    const data = body as {
      export_status?: string
      download_url?: string
      status?: string
    }

    const status = data.export_status ?? data.status ?? "unknown"

    if (status === "completed" || status === "done" || status === "success") {
      const url = data.download_url
      if (!url) {
        throw new Error(`Noon export ${exportCode} completed but no download_url was returned`)
      }
      return url
    }

    if (status === "failed" || status === "error") {
      throw new Error(`Noon export ${exportCode} failed with status "${status}"`)
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Noon export ${exportCode} timed out after ${maxAttempts} attempts`)
}

/**
 * Fetch the export file and upsert parsed products into the Supabase products
 * table. Returns the number of rows upserted.
 */
async function processExport(downloadUrl: string): Promise<number> {
  const response = await fetch(downloadUrl, {
    headers: {
      "User-Agent": USER_AGENT,
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to download export file (${response.status})`)
  }

  const text = await response.text()
  const rows = parseExportFile(text)

  if (rows.length === 0) {
    return 0
  }

  const { error } = await supabase
    .from("products")
    .upsert(rows, { onConflict: "partner_sku" })

  if (error) {
    throw new Error(`Failed to upsert products: ${error.message}`)
  }

  return rows.length
}

/**
 * Parse the export file content into product rows ready for upsert. Noon
 * exports are typically CSV or JSON; we detect the format and normalize.
 */
function parseExportFile(content: string): ProductRow[] {
  const trimmed = content.trim()
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJsonExport(trimmed)
  }
  return parseCsvExport(trimmed)
}

type ProductRow = {
  partner_sku: string
  name: string | null
  price: number | null
  msrp: number | null
  stock_qty: number | null
  delivery_mode: string | null
  is_active: boolean | null
}

function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return isNaN(n) ? null : n
}

function coerceBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "boolean") return value
  const s = String(value).toLowerCase()
  if (["true", "1", "yes", "active", "y"].includes(s)) return true
  if (["false", "0", "no", "inactive", "n"].includes(s)) return false
  return null
}

function mapRow(record: Record<string, unknown>): ProductRow | null {
  const sku =
    (record.partner_sku as string) ??
    (record.sku as string) ??
    (record["Partner SKU"] as string) ??
    (record.SKU as string)
  if (!sku) return null

  return {
    partner_sku: String(sku).trim(),
    name: (record.name as string) ?? (record.product_name as string) ?? (record.title as string) ?? null,
    price: coerceNumber(record.price ?? record["Price"] ?? record.selling_price),
    msrp: coerceNumber(record.msrp ?? record["MSRP"] ?? record.retail_price),
    stock_qty: coerceNumber(record.stock_qty ?? record.qty ?? record.quantity ?? record["Stock"]),
    delivery_mode:
      (record.delivery_mode as string) ?? (record["Delivery Mode"] as string) ?? null,
    is_active: coerceBool(record.is_active ?? record.active ?? record.status),
  }
}

function parseJsonExport(content: string): ProductRow[] {
  const parsed = JSON.parse(content)
  const records: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { products?: unknown[] }).products)
      ? ((parsed as { products: unknown[] }).products as Record<string, unknown>[])
      : []

  return records
    .map(mapRow)
    .filter((r): r is ProductRow => r !== null)
}

function parseCsvExport(content: string): ProductRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "")
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map((h) => h.trim())
  const records: Record<string, unknown>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    const record: Record<string, unknown> = {}
    headers.forEach((h, idx) => {
      record[h] = values[idx]?.trim() ?? ""
    })
    records.push(record)
  }

  return records
    .map(mapRow)
    .filter((r): r is ProductRow => r !== null)
}

/**
 * Split a single CSV line into fields, honoring quoted values containing
 * commas. Does not handle embedded newlines inside quoted fields — Noon's
 * product exports use one row per line.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += char
    }
  }

  fields.push(current)
  return fields
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    const action = body.action ?? "sync"

    if (action === "create") {
      const exportCode = await createExport()
      return new Response(
        JSON.stringify({ ok: true, export_code: exportCode }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (action === "status") {
      const exportCode = (body as { export_code?: string }).export_code
      if (!exportCode) {
        return new Response(
          JSON.stringify({ ok: false, error: "export_code is required for status action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const responseBody = await callNoonWithRetry(NOON_EXPORT_STATUS_URL, {
        export_code: exportCode,
      })

      return new Response(
        JSON.stringify({ ok: true, data: responseBody }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (action === "process") {
      const downloadUrl = (body as { download_url?: string }).download_url
      if (!downloadUrl) {
        return new Response(
          JSON.stringify({ ok: false, error: "download_url is required for process action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const count = await processExport(downloadUrl)
      return new Response(
        JSON.stringify({ ok: true, upserted: count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (action === "sync") {
      const existingCode = (body as { export_code?: string }).export_code
      const exportCode = existingCode ?? (await createExport())
      const downloadUrl = await pollExportStatus(exportCode)
      const count = await processExport(downloadUrl)
      return new Response(
        JSON.stringify({ ok: true, export_code: exportCode, upserted: count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
