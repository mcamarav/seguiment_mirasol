import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { accessFor, type Access } from '@/lib/permissions'
import { PROJECT_PHOTO_BUCKET, PROJECT_PHOTO_TTL } from '@/lib/project-photo'
import { buildTeamContext, toTeamsWithMembers, type TeamContext } from '@/lib/teams'
import { displayName } from '@/lib/format'
import type { Profile, Project, ProjectMember, TeamWithMembers } from '@/lib/types'

/** Tot el que cal per servir una pantalla de dins d'un projecte: qui ets, quin
 * projecte és, què hi pots fer i quins equips hi ha (que és d'on surten les
 * aprovacions). Ho carrega el layout de /p/[projecte] i cada server action, que
 * no es pot fiar del que li arriba del formulari. */
export interface ProjectContext {
  profile: Profile
  project: Project
  access: Access
  teams: TeamWithMembers[]
  teamCtx: TeamContext
}

/** El projecte del slug, amb els permisos de l'usuari dins d'ell.
 *
 * Retorna null si no hi ha sessió, si el projecte no existeix o si l'usuari no
 * hi té accés: l'RLS fa que un projecte sense accés simplement no es vegi, així
 * que aquí no cal distingir-ho (i és millor no fer-ho, per no confirmar que
 * existeix). */
export async function loadProjectContext(slug: string): Promise<ProjectContext | null> {
  const profile = await getCurrentProfile()
  if (!profile) return null

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, slug, name, image_path, active, created_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!project) return null

  const [{ data: member }, { data: teamRows }] = await Promise.all([
    supabase
      .from('project_members')
      .select('project_id, user_id, is_manager, can_create, can_edit_all, created_at')
      .eq('project_id', project.id)
      .eq('user_id', profile.id)
      .maybeSingle(),
    supabase
      .from('teams')
      .select('id, project_id, name, global_role, created_at, team_members(user_id)')
      .eq('project_id', project.id)
      .order('created_at'),
  ])

  // L'administrador de la instal·lació entra a tots els projectes encara que no
  // hi tingui fila de membre.
  if (!member && !profile.is_admin) return null

  const teams = toTeamsWithMembers(teamRows ?? [])

  return {
    profile,
    project: project as Project,
    access: accessFor(profile, (member as ProjectMember | null) ?? null),
    teams,
    teamCtx: buildTeamContext(teams, profile.id),
  }
}

/** La gent que té accés al projecte, amb els seus permisos dins d'ell. És qui
 * pot sortir als selectors d'«Assignat a» i a l'administració del projecte. */
export async function loadProjectPeople(
  projectId: number,
): Promise<{ profile: Profile; member: ProjectMember }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('project_members')
    .select('project_id, user_id, is_manager, can_create, can_edit_all, created_at, profiles(id, email, full_name, is_admin, created_at)')
    .eq('project_id', projectId)

  type Row = ProjectMember & { profiles: Profile | null }
  return ((data ?? []) as unknown as Row[])
    .flatMap(({ profiles, ...member }) => (profiles ? [{ profile: profiles, member }] : []))
    .sort((a, b) => displayName(a.profile).localeCompare(displayName(b.profile), 'ca'))
}

/** Els projectes als quals l'usuari té accés (l'RLS ja filtra). */
export async function listMyProjects(): Promise<Project[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, slug, name, image_path, active, created_at')
    .order('name')
  return (data ?? []) as Project[]
}

/** Signa les fotos de portada de tots aquests projectes d'un sol cop (el bucket
 * és privat). Retorna un mapa id de projecte -> URL; els que no tenen foto —o
 * els que la tenen trencada— simplement no hi surten. */
export async function signProjectPhotos(projects: Project[]): Promise<Map<number, string>> {
  const withPhoto = projects.filter((p) => p.image_path)
  const urls = new Map<number, string>()
  if (withPhoto.length === 0) return urls

  const supabase = await createClient()
  const { data } = await supabase.storage
    .from(PROJECT_PHOTO_BUCKET)
    .createSignedUrls(
      withPhoto.map((p) => p.image_path as string),
      PROJECT_PHOTO_TTL,
    )

  const byPath = new Map<string, string>()
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) byPath.set(entry.path, entry.signedUrl)
  }
  for (const p of withPhoto) {
    const url = byPath.get(p.image_path as string)
    if (url) urls.set(p.id, url)
  }
  return urls
}
