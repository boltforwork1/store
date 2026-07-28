import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_BASE = "https://noon-api-gateway.noon.partners"
const NOON_PRICING_URL = `${NOON_BASE}/pricing/v1/pricing/get`

const USER_AGENT = "NexCommerce/1.0.0"

const BATCH_SIZE = 500

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

type PricingItem = {
  partner_sku: string
  country_code: string
}

type PricingRequestBody = {
  items: PricingItem[]
}

type NoonPricingResponseItem = {
  partner_sku?: string
  price?: number
  status?: { status_code?: string; message?: string }
}

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

async function callNoonPricing(
  cookie: string,
  payload: PricingRequestBody
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(NOON_PRICING_URL, {
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

async function callNoonWithRetry(payload: PricingRequestBody): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  const first = await callNoonPricing(cookie, payload)

  if (first.status === 401) {
    const freshCookie = await getSessionCookie(true)
    const retry = await callNoonPricing(freshCookie, payload)

    if (retry.status !== 200) {
      throw new Error(
        `Noon pricing failed after re-auth (${retry.status}): ${JSON.stringify(retry.body)}`
      )
    }

    return retry.body
  }

  if (first.status !== 200) {
    throw new Error(
      `Noon pricing failed (${first.status}): ${JSON.stringify(first.body)}`
    )
  }

  return first.body
}

function extractItems(body: unknown): NoonPricingResponseItem[] {
  if (!body || typeof body !== "object") return []
  const obj = body as Record<string, unknown>

  const candidates: unknown[] = [
    obj.items,
    (obj.data as Record<string, unknown>)?.items,
    (obj.result as Record<string, unknown>)?.items,
  ]
  for (const c of candidates) {
    if (Array.isArray(c)) return c as NoonPricingResponseItem[]
  }
  return []
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as { country_code?: string }

    const countryCode = (parsed.country_code ?? "eg").trim().toLowerCase()
    if (!countryCode) {
      return new Response(
        JSON.stringify({ ok: false, error: "`country_code` is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 1. Fetch all partner_skus from the products table.
    const { data: productRows, error: fetchError } = await supabase
      .from("products")
      .select("partner_sku")
      .order("partner_sku")

    if (fetchError) {
      throw new Error(`Failed to fetch products: ${fetchError.message}`)
    }

    const skus = (productRows ?? [])
      .map((r) => (r as { partner_sku: string }).partner_sku)
      .filter((s) => typeof s === "string" && s.trim() !== "")

    if (skus.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, data: { total_products: 0, synced: 0, updated: 0, batches: 0 } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. Build batched payloads and call Noon pricing/get for each chunk.
    const batches = chunk(skus, BATCH_SIZE)
    const priceBySku = new Map<string, number>()

    for (const batch of batches) {
      const payload: PricingRequestBody = {
        items: batch.map((partner_sku) => ({ partner_sku, country_code: countryCode })),
      }

      const responseBody = await callNoonWithRetry(payload)
      const responseItems = extractItems(responseBody)

      for (const item of responseItems) {
        const sku = item.partner_sku
        if (typeof sku !== "string" || !sku) continue
        const price = Number(item.price ?? 0)
        priceBySku.set(sku, isNaN(price) ? 0 : price)
      }
    }

    // 3. Bulk update the products table with the retrieved prices.
    let updated = 0
    const updateBatches = chunk(skus, 500)

    for (const batch of updateBatches) {
      const updates = batch.map((sku) => ({
        partner_sku: sku,
        price: priceBySku.get(sku) ?? 0,
      }))

      const { error: updateError } = await supabase
        .from("products")
        .upsert(updates, { onConflict: "partner_sku" })

      if (updateError) {
        throw new Error(`Failed to update products: ${updateError.message}`)
      }

      updated += updates.length
    }

    const synced = priceBySku.size

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          total_products: skus.length,
          synced,
          updated,
          batches: batches.length,
          country_code: countryCode,
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
