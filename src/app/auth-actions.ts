'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface AuthState {
  error?: string
  notice?: string
}

const NOT_INVITED =
  'Aquest correu no està autoritzat. Demana a l’administrador que t’hi convidi i torna-ho a provar.'

const ALREADY_USED =
  'La invitació d’aquest correu ja s’ha fet servir. Entra amb la teva contrasenya o demana’n una de nova.'

function friendly(message: string): string {
  if (message === 'Invalid login credentials') return 'Correu o contrasenya incorrectes.'
  if (message === 'Email not confirmed') {
    return 'Encara no has confirmat l’adreça de correu. Revisa la safata d’entrada.'
  }
  if (message.includes('CORREU_NO_CONVIDAT')) return NOT_INVITED
  if (message.includes('CORREU_JA_UTILITZAT')) return ALREADY_USED
  // Supabase amaga les excepcions del trigger darrere d'un error genèric.
  if (/Database error (saving|creating) new user/i.test(message)) return NOT_INVITED
  if (/already registered/i.test(message)) {
    return 'Aquest correu ja té un compte. Prova d’entrar-hi.'
  }
  if (/fetch failed|Failed to fetch|Load failed/i.test(message)) {
    return 'No s’ha pogut connectar amb el servidor. Comprova la connexió i la configuració de Supabase.'
  }
  return message
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) return { error: 'Cal el correu i la contrasenya.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('full_name') ?? '').trim()

  if (!email || !password) return { error: 'Cal el correu i la contrasenya.' }
  if (password.length < 8) return { error: 'La contrasenya ha de tenir com a mínim 8 caràcters.' }

  const supabase = await createClient()

  // Comprovació prèvia només per donar un missatge clar. Qui realment bloqueja
  // els correus no convidats és el trigger handle_new_user() a la base de dades.
  const { data: invited, error: inviteCheckError } = await supabase.rpc('email_is_invited', {
    p_email: email,
  })
  if (!inviteCheckError && invited === false) return { error: NOT_INVITED }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })

  if (error) return { error: friendly(error.message) }

  // Amb la confirmació per correu activada, signUp no obre sessió.
  if (!data.session) {
    return {
      notice:
        'Compte creat. Revisa el teu correu per confirmar l’adreça i després ja podràs entrar.',
    }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/entrar')
}
