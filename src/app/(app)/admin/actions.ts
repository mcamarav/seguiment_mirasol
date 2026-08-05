'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import type { GlobalTeamRole } from '@/lib/types'

type Table = 'zones' | 'work_types'

async function requireAdmin() {
  const profile = await getCurrentProfile()
  if (!profile || !isAdmin(profile)) throw new Error('Cal ser administrador.')
  return profile
}

function tableOf(formData: FormData): Table {
  const table = String(formData.get('table') ?? '')
  if (table !== 'zones' && table !== 'work_types') throw new Error('Taula no vàlida.')
  return table
}

/** Permisos globals d'un usuari: administrador, pot crear fitxes, pot editar-les totes. */
export async function setUserCapabilities(formData: FormData): Promise<void> {
  await requireAdmin()

  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return

  const supabase = await createClient()
  await supabase
    .from('profiles')
    .update({
      is_admin: formData.get('is_admin') === 'on',
      can_create: formData.get('can_create') === 'on',
      can_edit_all: formData.get('can_edit_all') === 'on',
    })
    .eq('id', userId)

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
}

/** Autoritza un correu a registrar-se. Els equips i permisos es donen després, des d'aquí. */
export async function inviteEmail(formData: FormData): Promise<void> {
  const admin = await requireAdmin()

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const note = String(formData.get('note') ?? '').trim() || null
  const is_admin = formData.get('is_admin') === 'on'

  if (!email || !email.includes('@')) return

  const supabase = await createClient()
  await supabase
    .from('invitations')
    .upsert({ email, is_admin, note, invited_by: admin.id }, { onConflict: 'email' })

  revalidatePath('/admin')
}

/** Retira una invitació. Si ja s'havia fet servir, el compte segueix existint. */
export async function revokeInvitation(formData: FormData): Promise<void> {
  await requireAdmin()

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return

  const supabase = await createClient()
  await supabase.from('invitations').delete().eq('email', email)

  revalidatePath('/admin')
}

export async function addCatalogItem(formData: FormData): Promise<void> {
  await requireAdmin()
  const table = tableOf(formData)

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  const supabase = await createClient()
  await supabase.from(table).insert({ name, sort_order: 500 })

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function toggleCatalogItem(formData: FormData): Promise<void> {
  await requireAdmin()
  const table = tableOf(formData)

  const id = Number(formData.get('id'))
  const active = String(formData.get('active')) === 'true'
  if (!id) return

  const supabase = await createClient()
  await supabase.from(table).update({ active: !active }).eq('id', id)

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function renameCatalogItem(formData: FormData): Promise<void> {
  await requireAdmin()
  const table = tableOf(formData)

  const id = Number(formData.get('id'))
  const name = String(formData.get('name') ?? '').trim()
  if (!id || !name) return

  const supabase = await createClient()
  await supabase.from(table).update({ name }).eq('id', id)

  revalidatePath('/admin')
  revalidatePath('/')
}

/** Crea un equip nou, sense cap membre. */
export async function createTeam(formData: FormData): Promise<void> {
  await requireAdmin()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  const supabase = await createClient()
  await supabase.from('teams').insert({ name })

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function renameTeam(formData: FormData): Promise<void> {
  await requireAdmin()

  const id = Number(formData.get('id'))
  const name = String(formData.get('name') ?? '').trim()
  if (!id || !name) return

  const supabase = await createClient()
  await supabase.from('teams').update({ name }).eq('id', id)

  revalidatePath('/admin')
  revalidatePath('/')
}

/** L'equip que aprova globalment (a totes les fitxes) la casella de tècnics o
 * propietaris. Com a molt un equip pot tenir cada rol — assignar-lo el treu
 * automàticament de qualsevol altre equip que el tingués. */
export async function setTeamGlobalRole(formData: FormData): Promise<void> {
  await requireAdmin()

  const id = Number(formData.get('id'))
  const raw = String(formData.get('global_role') ?? '')
  const global_role: GlobalTeamRole | null = raw === 'tecnics' || raw === 'propietaris' ? raw : null
  if (!id) return

  const supabase = await createClient()
  if (global_role) {
    await supabase.from('teams').update({ global_role: null }).eq('global_role', global_role)
  }
  await supabase.from('teams').update({ global_role }).eq('id', id)

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function deleteTeam(formData: FormData): Promise<void> {
  await requireAdmin()

  const id = Number(formData.get('id'))
  if (!id) return

  const supabase = await createClient()
  await supabase.from('teams').delete().eq('id', id)

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function toggleTeamMembership(formData: FormData): Promise<void> {
  await requireAdmin()

  const teamId = Number(formData.get('team_id'))
  const userId = String(formData.get('user_id') ?? '')
  const isMember = String(formData.get('is_member')) === 'true'
  if (!teamId || !userId) return

  const supabase = await createClient()
  if (isMember) {
    await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
  } else {
    await supabase.from('team_members').upsert({ team_id: teamId, user_id: userId })
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
}
