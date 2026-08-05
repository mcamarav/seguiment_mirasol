import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'
import type { Profile } from '@/lib/types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Cridat des d'un Server Component: el middleware ja refresca la sessió.
        }
      },
    },
  })
}

/** Perfil de l'usuari actual, o null si no hi ha sessió. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_admin, can_create, can_edit_all, created_at')
    .eq('id', user.id)
    .maybeSingle()

  return (data as Profile | null) ?? null
}
