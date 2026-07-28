import { createClient } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const NOON_CONTENT_URL =
  "https://noon-api-gateway.noon.partners/content/v1/product/content/get"

// Per the Noon Partner API spec, ALL requests must include a User-Agent header
// identifying the application. Requests without it may be rejected.
const USER_AGENT = "NexCommerce/1.0.0"

// The Noon GetContent endpoint is NOT batched — it accepts a single SKU per
// call. We cap the number of products synced per invocation to stay well
// within edge function time limits.
const SYNC_LIMIT = 30

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

/**
 * Fetch a valid Noon session cookie from the noon-auth edge function. When
 * `force` is true the cached cookie is invalidated and a fresh login is
 * performed — used to recover from a 401 during a content call.
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
 * Call the Noon GetContent endpoint for a single SKU. Returns the parsed JSON
 * body and the HTTP status.
 */
async function callNoonContent(
  cookie: string,
  skuParent: string
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(NOON_CONTENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ sku_parent: skuParent }),
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
 * Call the Noon GetContent endpoint, transparently re-authenticating once on
 * 401. Returns the parsed response body.
 */
async function callNoonWithRetry(skuParent: string): Promise<unknown> {
  const cookie = await getSessionCookie(false)
  const first = await callNoonContent(cookie, skuParent)

  if (first.status === 401) {
    const freshCookie = await getSessionCookie(true)
    const retry = await callNoonContent(freshCookie, skuParent)

    if (retry.status !== 200) {
      throw new Error(
        `Noon content call failed after re-auth (${retry.status}): ${JSON.stringify(retry.body)}`
      )
    }

    return retry.body
  }

  if (first.status !== 200) {
    throw new Error(
      `Noon content call failed (${first.status}): ${JSON.stringify(first.body)}`
    )
  }

  return first.body
}

/**
 * The GetContent response may nest the product object under `data`/`result`/
 * `product`. Try each shape and return the first object that carries an
 * `images` or `attributes` field.
 */
function findContentObject(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null
  const obj = body as Record<string, unknown>

  const candidates: Record<string, unknown>[] = [obj]
  for (const key of ["data", "result", "product", "content"]) {
    const nested = obj[key]
    if (nested && typeof nested === "object") {
      candidates.push(nested as Record<string, unknown>)
    }
  }

  return (
    candidates.find((c) => Array.isArray(c.images) || (c.attributes && typeof c.attributes === "object")) ??
    null
  )
}

/**
 * Extract the first image URL from the content object. Noon returns an
 * `images` array where each entry has a `url` field.
 */
function extractImageUrl(content: Record<string, unknown>): string | null {
  const images = content.images
  if (!Array.isArray(images) || images.length === 0) return null

  for (const img of images) {
    if (img && typeof img === "object") {
      const url = (img as Record<string, unknown>).url
      if (typeof url === "string" && url.trim() !== "") {
        return url.trim()
      }
    }
  }

  return null
}

// Keys that commonly carry the product name, ordered by preference.
const NAME_ATTRIBUTE_KEYS = [
  "name_en",
  "title_en",
  "name",
  "title",
  "product_name",
  "product_name_en",
  "display_name",
]

/**
 * Extract the product name from the dynamic `attributes` object. Noon returns
 * attributes as a map of key -> { values: string[] }. We look for keys matching
 * common name variants and return the first value from its `values` array.
 */
function extractName(content: Record<string, unknown>): string | null {
  const attributes = content.attributes
  if (!attributes || typeof attributes !== "object") return null

  const attrs = attributes as Record<string, unknown>

  // 1. Try known name keys first (preferred order).
  for (const key of NAME_ATTRIBUTE_KEYS) {
    const value = readAttributeValue(attrs[key])
    if (value) return value
  }

  // 2. Fallback: scan all attributes for any key containing "name" or "title".
  for (const [key, raw] of Object.entries(attrs)) {
    const lower = key.toLowerCase()
    if (lower.includes("name") || lower.includes("title")) {
      const value = readAttributeValue(raw)
      if (value) return value
    }
  }

  return null
}

/**
 * Read a single string value from a Noon attribute. Attributes are shaped as
 * `{ values: string[] }` (sometimes `{ value: string }`). We return the first
 * non-empty entry.
 */
function readAttributeValue(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const attr = raw as Record<string, unknown>

  const values = attr.values
  if (Array.isArray(values)) {
    for (const v of values) {
      if (typeof v === "string" && v.trim() !== "") {
        return v.trim()
      }
    }
  }

  if (typeof attr.value === "string" && attr.value.trim() !== "") {
    return attr.value.trim()
  }

  return null
}

type SyncResult = {
  sku: string
  name: string | null
  image_url: string | null
  updated: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const parsed = (await req.json().catch(() => ({}))) as { limit?: number }
    const limit = Math.min(Math.max(Number(parsed.limit) || SYNC_LIMIT, 1), 50)

    // 1. Fetch products that still need catalog details. We prioritize rows
    //    where the image_url is null (never synced). Ordering by created_at
    //    keeps the sync deterministic across invocations.
    const { data: productRows, error: fetchError } = await supabase
      .from("products")
      .select("partner_sku")
      .is("image_url", null)
      .order("created_at", { ascending: true })
      .limit(limit)

    if (fetchError) {
      throw new Error(`Failed to fetch products: ${fetchError.message}`)
    }

    const skus = (productRows ?? [])
      .map((r) => (r as { partner_sku: string }).partner_sku)
      .filter((s) => typeof s === "string" && s.trim() !== "")

    if (skus.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: { total_products: 0, synced: 0, updated: 0, results: [] },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. Loop through each SKU and fetch content from Noon (one call per SKU).
    const results: SyncResult[] = []

    for (const sku of skus) {
      try {
        const responseBody = await callNoonWithRetry(sku)
        const content = findContentObject(responseBody)

        const name = content ? extractName(content) : null
        const imageUrl = content ? extractImageUrl(content) : null

        results.push({ sku, name, image_url: imageUrl, updated: false })
      } catch (err) {
        // Record the failure but continue with the remaining SKUs so a single
        // bad product doesn't abort the whole sync.
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error(`Failed to sync content for ${sku}: ${message}`)
        results.push({ sku, name: null, image_url: null, updated: false })
      }
    }

    // 3. Bulk update the products table with the retrieved name + image_url.
    //    We only update rows where we actually got a name or image; rows that
    //    returned nothing are left untouched so they can be retried later.
    const updates = results
      .filter((r) => r.name !== null || r.image_url !== null)
      .map((r) => ({
        partner_sku: r.sku,
        name: r.name,
        image_url: r.image_url,
      }))

    let updated = 0
    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from("products")
        .upsert(updates, { onConflict: "partner_sku" })

      if (updateError) {
        throw new Error(`Failed to update products: ${updateError.message}`)
      }

      updated = updates.length
      for (const r of results) {
        if (r.name !== null || r.image_url !== null) {
          r.updated = true
        }
      }
    }

    const synced = results.filter((r) => r.updated).length

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          total_products: skus.length,
          synced,
          updated,
          results,
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
