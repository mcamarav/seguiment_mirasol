'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import { slugify } from '@/lib/routes'
import { PROJECT_PHOTO_BUCKET, projectOfPhotoPath } from '@/lib/project-photo'
import type { Profile } from '@/lib/types'

/** Els projectes com a tals: crear-los, amagar-los, esborrar-los i posar-los
 * foto. Viuen aquí i no a `admin/actions.ts` perquè la llista de projectes
 * (la pantalla d'inici) també els fa servir, i la foto no és cosa només de
 * l'administrador de la instal·lació: la pot canviar qui administra l'obra. */

async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile || !isAdmin(profile)) throw new Error('Cal ser administrador.')
  return profile
}

/** Qui administra el projecte (o la instal·lació sencera). L'RLS ja ho torna a
 * comprovar, però comprovant-ho aquí en surt un missatge que es pot ensenyar. */
async function canManage(projectId: number): Promise<boolean> {
  const profile = await getCurrentProfile()
  if (!profile) return false
  if (isAdmin(profile)) return true

  const supabase = await createClient()
  const { data } = await supabase
    .from('project_members')
    .select('is_manager')
    .eq('project_id', projectId)
    .eq('user_id', profile.id)
    .maybeSingle()
  return (data as { is_manager: boolean } | null)?.is_manager ?? false
}

function refresh(): void {
  revalidatePath('/admin')
  revalidatePath('/', 'layout')
}

/** Crea un projecte i li sembra les zones i els tipus per defecte. El slug surt
 * del nom i és el que quedarà a la URL per sempre.
 *
 * Retorna l'id del projecte nou perquè qui l'ha creat hi pugui pujar la foto
 * tot seguit: el camí del fitxer al bucket comença per aquest id. */
export async function createProject(
  formData: FormData,
): Promise<{ error?: string; project?: { id: number; slug: string } }> {
  await requireAdmin()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Cal un nom.' }

  const base = slugify(String(formData.get('slug') ?? '') || name)
  if (!base) return { error: 'D’aquest nom no en surt cap adreça: escriu-ne una.' }

  const supabase = await createClient()

  // Si el slug ja existeix se li posa un sufix: -2, -3…
  const { data: taken } = await supabase.from('projects').select('slug').like('slug', `${base}%`)
  const used = new Set(((taken ?? []) as { slug: string }[]).map((p) => p.slug))
  let slug = base
  for (let i = 2; used.has(slug); i += 1) slug = `${base}-${i}`

  const { data, error } = await supabase
    .from('projects')
    .insert({ slug, name })
    .select('id, slug')
    .single()

  if (error || !data) return { error: error?.message ?? 'No s’ha pogut crear el projecte.' }

  await supabase.rpc('seed_project_catalogs', { p_project_id: data.id })

  refresh()
  return { project: data as { id: number; slug: string } }
}

/** Amaga o recupera un projecte: deixa de sortir al selector, però no s'esborra
 * res i qui hi tenia accés hi pot continuar entrant per l'enllaç. */
export async function setProjectActive(formData: FormData): Promise<void> {
  await requireAdmin()

  const id = Number(formData.get('id'))
  const active = String(formData.get('active')) === 'true'
  if (!id) return

  const supabase = await createClient()
  await supabase.from('projects').update({ active: !active }).eq('id', id)

  refresh()
}

/** Esborra un projecte, i només si està buit: amb fitxes a dins s'ho enduria tot
 * (comentaris i imatges inclosos) i no hi ha manera de desfer-ho. */
export async function deleteProject(formData: FormData): Promise<void> {
  await requireAdmin()

  const id = Number(formData.get('id'))
  if (!id) return

  const supabase = await createClient()
  const { count } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id)

  if ((count ?? 0) > 0) return

  const { data: project } = await supabase
    .from('projects')
    .select('image_path')
    .eq('id', id)
    .maybeSingle()

  await supabase.from('projects').delete().eq('id', id)

  const path = (project as { image_path: string | null } | null)?.image_path
  if (path) await supabase.storage.from(PROJECT_PHOTO_BUCKET).remove([path])

  refresh()
}

/** Desa la foto que el navegador acaba de pujar al bucket i treu la que hi
 * hagués abans, que ja no la mirarà ningú. */
export async function setProjectPhoto(
  projectId: number,
  path: string,
): Promise<{ error?: string }> {
  if (!(await canManage(projectId))) return { error: 'No pots canviar la foto d’aquest projecte.' }
  // El camí ve del client: ha de ser d'aquest projecte i de cap altre.
  if (projectOfPhotoPath(path) !== projectId) return { error: 'Aquesta imatge no és del projecte.' }

  const supabase = await createClient()
  const { data: before } = await supabase
    .from('projects')
    .select('image_path')
    .eq('id', projectId)
    .maybeSingle()

  const { error } = await supabase
    .from('projects')
    .update({ image_path: path })
    .eq('id', projectId)
  if (error) return { error: error.message }

  const old = (before as { image_path: string | null } | null)?.image_path
  if (old && old !== path) await supabase.storage.from(PROJECT_PHOTO_BUCKET).remove([old])

  refresh()
  return {}
}

/** Treu la foto del projecte (el projecte es queda, només perd la portada). */
export async function removeProjectPhoto(projectId: number): Promise<{ error?: string }> {
  if (!(await canManage(projectId))) return { error: 'No pots canviar la foto d’aquest projecte.' }

  const supabase = await createClient()
  const { data: before } = await supabase
    .from('projects')
    .select('image_path')
    .eq('id', projectId)
    .maybeSingle()

  const { error } = await supabase
    .from('projects')
    .update({ image_path: null })
    .eq('id', projectId)
  if (error) return { error: error.message }

  const old = (before as { image_path: string | null } | null)?.image_path
  if (old) await supabase.storage.from(PROJECT_PHOTO_BUCKET).remove([old])

  refresh()
  return {}
}
