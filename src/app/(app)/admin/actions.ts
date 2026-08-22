'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import type { Profile } from '@/lib/types'

/** Aquesta pantalla és de l'administrador de la instal·lació: comptes i
 * invitacions (els projectes en si són a `../project-actions`). Els permisos de
 * dins de cada projecte es reparteixen a /p/[projecte]/admin. */
async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile || !isAdmin(profile)) throw new Error('Cal ser administrador.')
  return profile
}

function refresh(): void {
  revalidatePath('/admin')
  revalidatePath('/', 'layout')
}

// -----------------------------------------------------------------------------
// Comptes
// -----------------------------------------------------------------------------

/** Administrador de la instal·lació: ho pot fer tot a tots els projectes. */
export async function setUserAdmin(formData: FormData): Promise<void> {
  const me = await requireAdmin()

  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return
  // Treure's un mateix l'administració deixaria la instal·lació sense ningú que
  // hi pugui entrar si és l'únic administrador; és més senzill no permetre-ho.
  if (userId === me.id) return

  const supabase = await createClient()
  await supabase
    .from('profiles')
    .update({ is_admin: formData.get('is_admin') === 'on' })
    .eq('id', userId)

  refresh()
}

// -----------------------------------------------------------------------------
// Convidats
// -----------------------------------------------------------------------------

/** Autoritza un correu a registrar-se, amb els projectes (opcionals) als quals
 * tindrà accés quan es registri. */
export async function inviteEmail(formData: FormData): Promise<void> {
  const admin = await requireAdmin()

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const note = String(formData.get('note') ?? '').trim() || null
  const is_admin = formData.get('is_admin') === 'on'
  const canCreate = formData.get('can_create') === 'on'
  const projectIds = formData
    .getAll('project_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)

  if (!email || !email.includes('@')) return

  const supabase = await createClient()
  await supabase
    .from('invitations')
    .upsert({ email, is_admin, note, invited_by: admin.id }, { onConflict: 'email' })

  await supabase.from('invitation_projects').delete().eq('email', email)
  if (projectIds.length > 0) {
    await supabase.from('invitation_projects').insert(
      projectIds.map((project_id) => ({ email, project_id, can_create: canCreate })),
    )
  }

  revalidatePath('/admin')
}

/** Afegeix o treu un projecte d'una invitació encara pendent. */
export async function toggleInvitationProject(formData: FormData): Promise<void> {
  await requireAdmin()

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const projectId = Number(formData.get('project_id'))
  const hasAccess = String(formData.get('has_access')) === 'true'
  if (!email || !projectId) return

  const supabase = await createClient()
  if (hasAccess) {
    await supabase
      .from('invitation_projects')
      .delete()
      .eq('email', email)
      .eq('project_id', projectId)
  } else {
    await supabase.from('invitation_projects').upsert({ email, project_id: projectId })
  }

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
