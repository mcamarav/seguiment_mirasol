'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canManageProject } from '@/lib/permissions'
import { loadProjectContext, type ProjectContext } from '@/lib/project'
import { projectPath } from '@/lib/routes'
import type { GlobalTeamRole } from '@/lib/types'

type Table = 'zones' | 'work_types'

/** Tota acció d'aquesta pantalla porta el slug del projecte al formulari, i aquí
 * es torna a comprovar que qui la crida l'administra. El slug només diu de quin
 * projecte parlem: els permisos surten sempre de la base de dades. */
async function requireManager(formData: FormData): Promise<ProjectContext> {
  const slug = String(formData.get('projecte') ?? '')
  const context = await loadProjectContext(slug)
  if (!context || !canManageProject(context.access)) {
    throw new Error('Cal administrar aquest projecte.')
  }
  return context
}

function refresh(slug: string): void {
  revalidatePath(projectPath(slug, '/admin'))
  revalidatePath(projectPath(slug))
}

function tableOf(formData: FormData): Table {
  const table = String(formData.get('table') ?? '')
  if (table !== 'zones' && table !== 'work_types') throw new Error('Taula no vàlida.')
  return table
}

// -----------------------------------------------------------------------------
// Accessos al projecte
// -----------------------------------------------------------------------------

/** Dona accés al projecte a algú que ja té compte. */
export async function addProjectMember(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return

  const supabase = await createClient()
  await supabase
    .from('project_members')
    .upsert({ project_id: project.id, user_id: userId }, { onConflict: 'project_id,user_id' })

  refresh(project.slug)
}

/** Permisos d'algú dins d'aquest projecte. */
export async function setMemberCapabilities(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return

  const supabase = await createClient()
  await supabase
    .from('project_members')
    .update({
      is_manager: formData.get('is_manager') === 'on',
      can_create: formData.get('can_create') === 'on',
      can_edit_all: formData.get('can_edit_all') === 'on',
    })
    .eq('project_id', project.id)
    .eq('user_id', userId)

  refresh(project.slug)
}

/** Treu l'accés al projecte. El trigger de la base de dades també el treu dels
 * equips d'aquest projecte; les fitxes que hagi creat es queden. */
export async function removeProjectMember(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return

  const supabase = await createClient()
  await supabase
    .from('project_members')
    .delete()
    .eq('project_id', project.id)
    .eq('user_id', userId)

  refresh(project.slug)
}

// -----------------------------------------------------------------------------
// Equips del projecte
// -----------------------------------------------------------------------------

export async function createTeam(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  const supabase = await createClient()
  await supabase.from('teams').insert({ project_id: project.id, name })

  refresh(project.slug)
}

export async function renameTeam(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const id = Number(formData.get('id'))
  const name = String(formData.get('name') ?? '').trim()
  if (!id || !name) return

  const supabase = await createClient()
  await supabase.from('teams').update({ name }).eq('id', id).eq('project_id', project.id)

  refresh(project.slug)
}

/** L'equip que aprova, a totes les fitxes d'aquest projecte, la casella de
 * tècnics o de propietaris. Com a molt un equip per projecte pot tenir cada rol
 * — assignar-lo el treu automàticament de qualsevol altre equip del projecte. */
export async function setTeamGlobalRole(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const id = Number(formData.get('id'))
  const raw = String(formData.get('global_role') ?? '')
  const global_role: GlobalTeamRole | null = raw === 'tecnics' || raw === 'propietaris' ? raw : null
  if (!id) return

  const supabase = await createClient()
  if (global_role) {
    await supabase
      .from('teams')
      .update({ global_role: null })
      .eq('project_id', project.id)
      .eq('global_role', global_role)
  }
  await supabase.from('teams').update({ global_role }).eq('id', id).eq('project_id', project.id)

  refresh(project.slug)
}

export async function deleteTeam(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const id = Number(formData.get('id'))
  if (!id) return

  const supabase = await createClient()
  await supabase.from('teams').delete().eq('id', id).eq('project_id', project.id)

  refresh(project.slug)
}

export async function toggleTeamMembership(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

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

  refresh(project.slug)
}

// -----------------------------------------------------------------------------
// Zones i tipus del projecte
// -----------------------------------------------------------------------------

export async function addCatalogItem(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)
  const table = tableOf(formData)

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  const supabase = await createClient()
  await supabase.from(table).insert({ project_id: project.id, name, sort_order: 500 })

  refresh(project.slug)
}

export async function toggleCatalogItem(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)
  const table = tableOf(formData)

  const id = Number(formData.get('id'))
  const active = String(formData.get('active')) === 'true'
  if (!id) return

  const supabase = await createClient()
  await supabase.from(table).update({ active: !active }).eq('id', id).eq('project_id', project.id)

  refresh(project.slug)
}

export async function renameCatalogItem(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)
  const table = tableOf(formData)

  const id = Number(formData.get('id'))
  const name = String(formData.get('name') ?? '').trim()
  if (!id || !name) return

  const supabase = await createClient()
  await supabase.from(table).update({ name }).eq('id', id).eq('project_id', project.id)

  refresh(project.slug)
}

/** Sembra al projecte les zones i els tipus per defecte (les que porta
 * l'esquema). Serveix per a un projecte que s'hagi quedat sense llistes. */
export async function seedCatalogs(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const supabase = await createClient()
  await supabase.rpc('seed_project_catalogs', { p_project_id: project.id })

  refresh(project.slug)
}

/** Canviar el nom del projecte (el slug de la URL no es toca mai: els enllaços
 * que la gent ja té guardats han de continuar funcionant). */
export async function renameProject(formData: FormData): Promise<void> {
  const { project } = await requireManager(formData)

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  const supabase = await createClient()
  await supabase.from('projects').update({ name }).eq('id', project.id)

  refresh(project.slug)
  revalidatePath('/', 'layout')
}
