import { supabase } from "@/lib/supabase"

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-management`

async function callAdminFunction(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { data: session } = await supabase.auth.getSession()
  const accessToken = session.session?.access_token

  if (!accessToken) {
    return { ok: false, error: "You must be signed in to perform this action." }
  }

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  })

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
  }

  if (!response.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Request failed (${response.status})` }
  }

  return { ok: true }
}

export async function createStaffUser(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return callAdminFunction({ action: "create", email, password })
}

export async function updateStaffPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return callAdminFunction({ action: "update_password", email, password })
}

export async function deleteStaffUser(email: string): Promise<{ ok: boolean; error?: string }> {
  return callAdminFunction({ action: "delete", email })
}

export type StaffUser = {
  id: string
  email: string
  created_at: string
}
