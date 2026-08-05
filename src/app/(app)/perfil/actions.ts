'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ProfileFormState {
  error?: string
  notice?: string
}

function friendly(message: string): string {
  if (/should be at least/i.test(message)) return 'La contrasenya ha de tenir com a mínim 8 caràcters.'
  if (/same as the old password/i.test(message)) {
    return 'La contrasenya nova ha de ser diferent de l’actual.'
  }
  return message
}

export async function updateFullName(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const fullName = String(formData.get('full_name') ?? '').trim()
  if (!fullName) return { error: 'Cal un nom.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Cal tornar a entrar.' }

  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { notice: 'Nom actualitzat.' }
}

export async function updatePassword(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  if (password.length < 8) return { error: 'La contrasenya ha de tenir com a mínim 8 caràcters.' }
  if (password !== confirmPassword) return { error: 'Les contrasenyes no coincideixen.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: friendly(error.message) }

  return { notice: 'Contrasenya actualitzada.' }
}
