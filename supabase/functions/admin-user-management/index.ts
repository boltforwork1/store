import { createClient, type UserResponse } from "npm:@supabase/supabase-js@2.110.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

type CreateUserBody = {
  action: "create"
  email?: unknown
  password?: unknown
}

type UpdatePasswordBody = {
  action: "update_password"
  email?: unknown
  password?: unknown
}

type RequestBody = CreateUserBody | UpdatePasswordBody

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function verifyCaller(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token) return false
  const { data } = await supabase.auth.getUser(token)
  return data.user !== null
}

async function createUser(email: string, password: string): Promise<Response> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    const message =
      error.message.includes("already") || error.message.includes("registered")
        ? "A user with this email already exists."
        : error.message
    return json({ ok: false, error: message }, 400)
  }

  const user = (data as UserResponse["data"])?.user
  if (!user) {
    return json({ ok: false, error: "Failed to create user." }, 500)
  }

  const { error: mirrorError } = await supabase
    .from("staff_users")
    .upsert({ id: user.id, email }, { onConflict: "email" })

  if (mirrorError) {
    console.error("staff_users mirror failed:", mirrorError.message)
  }

  return json({ ok: true, user: { id: user.id, email: user.email ?? email } })
}

async function updatePassword(email: string, password: string): Promise<Response> {
  const { data: list, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    return json({ ok: false, error: listError.message }, 500)
  }

  const target = (list.users ?? []).find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )

  if (!target) {
    return json({ ok: false, error: "User not found." }, 404)
  }

  const { error } = await supabase.auth.admin.updateUserById(target.id, {
    password,
  })

  if (error) {
    return json({ ok: false, error: error.message }, 400)
  }

  return json({ ok: true })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!(await verifyCaller(authHeader))) {
      return json({ ok: false, error: "Unauthorized." }, 401)
    }

    const parsed = (await req.json().catch(() => ({}))) as RequestBody

    if (parsed.action !== "create" && parsed.action !== "update_password") {
      return json(
        { ok: false, error: "`action` must be \"create\" or \"update_password\"." },
        400
      )
    }

    const email = typeof parsed.email === "string" ? parsed.email.trim() : ""
    const password = typeof parsed.password === "string" ? parsed.password : ""

    if (!EMAIL_REGEX.test(email)) {
      return json({ ok: false, error: "A valid email is required." }, 400)
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json(
        { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        400
      )
    }

    if (parsed.action === "create") {
      return await createUser(email, password)
    }
    return await updatePassword(email, password)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return json({ ok: false, error: message }, 500)
  }
})
