'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  canApprove,
  canCommentTicket,
  canCreateTickets,
  canEditTicket,
  canManageProject,
  canMarkReviewed,
  canRequestReview,
} from '@/lib/permissions'
import { loadProjectContext, type ProjectContext } from '@/lib/project'
import { projectPath } from '@/lib/routes'
import type { Actor, ReviewActor, TicketImageField } from '@/lib/types'

export interface FormState {
  error?: string
  ok?: boolean
}

const APPROVAL_COLUMN: Record<Actor, string> = {
  responsable: 'approved_responsable_at',
  tecnics: 'approved_tecnics_at',
  propietari: 'approved_propietari_at',
}

const REVIEW_COLUMN: Record<ReviewActor, string> = {
  tecnics: 'review_tecnics_at',
  propietari: 'review_propietari_at',
}

/** Cap petició de revisió: el punt de partida quan el responsable torna a
 * marcar la feina com a feta o quan retira la seva aprovació. */
const NO_REVIEWS = { review_tecnics_at: null, review_propietari_at: null }

function optional(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? '').trim()
  return value === '' ? null : value
}

function optionalId(formData: FormData, key: string): number | null {
  const value = optional(formData, key)
  return value === null ? null : Number(value)
}

/** El selector "Assignat a" val "user:<uuid>", "team:<id>" o buit. */
function parseAssignee(formData: FormData): { assignee_id: string | null; assignee_team_id: number | null } {
  const raw = optional(formData, 'assignee')
  if (!raw) return { assignee_id: null, assignee_team_id: null }
  if (raw.startsWith('user:')) return { assignee_id: raw.slice(5), assignee_team_id: null }
  if (raw.startsWith('team:')) return { assignee_id: null, assignee_team_id: Number(raw.slice(5)) }
  return { assignee_id: null, assignee_team_id: null }
}

/** Els camps de la fitxa que venen del formulari. El projecte no hi és mai: el
 * d'una fitxa nova el diu la ruta, i el d'una que ja existeix no es pot canviar. */
function ticketFields(formData: FormData) {
  return {
    description: optional(formData, 'description'),
    zone_id: optionalId(formData, 'zone_id'),
    work_type_id: optionalId(formData, 'work_type_id'),
    agreed_solution: optional(formData, 'agreed_solution'),
    due_date: optional(formData, 'due_date'),
    ...parseAssignee(formData),
  }
}

type TicketRow = {
  id: number
  ref: number
  project_id: number
  created_by: string | null
  assignee_id: string | null
  assignee_team_id: number | null
  approved_responsable_at: string | null
  review_tecnics_at: string | null
  review_propietari_at: string | null
  projects: { slug: string } | null
}

/** La fitxa i el context del seu projecte. El projecte no s'agafa mai del
 * formulari: es deriva de la fitxa, i els permisos es tornen a calcular aquí.
 * Si la fitxa no existeix (o l'RLS no la deixa veure) retorna null. */
async function loadTicketContext(
  ticketId: number,
): Promise<{ ticket: TicketRow; context: ProjectContext } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tickets')
    // El literal ha d'anar sencer en una sola línia: és el que fa servir el
    // client de Supabase per inferir el tipus de la fila.
    .select('id, ref, project_id, created_by, assignee_id, assignee_team_id, approved_responsable_at, review_tecnics_at, review_propietari_at, projects(slug)')
    .eq('id', ticketId)
    .maybeSingle()

  const ticket = data as TicketRow | null
  if (!ticket?.projects?.slug) return null

  const context = await loadProjectContext(ticket.projects.slug)
  return context ? { ticket, context } : null
}

function revalidateTicket(slug: string, ref: number): void {
  revalidatePath(projectPath(slug))
  revalidatePath(projectPath(slug, `/tickets/${ref}`))
}

export async function createTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get('projecte') ?? '')
  const context = await loadProjectContext(slug)
  if (!context) return { error: 'Projecte no trobat o sense accés.' }
  if (!canCreateTickets(context.access)) return { error: 'No tens permís per crear fitxes en aquest projecte.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'El nom curt és obligatori.' }

  const supabase = await createClient()

  // Sense `.select()`: això el convertiria en un INSERT ... RETURNING, i el
  // RETURNING ha de passar la policy de lectura. Aquestes funcions són STABLE,
  // així que consulten la taula amb el snapshot d'abans de la inserció i no
  // veuen la fila nova: Postgres avorta amb un error d'RLS. El número es busca
  // a part.
  const { error } = await supabase.from('tickets').insert({
    project_id: context.project.id,
    title,
    ...ticketFields(formData),
  })

  if (error) return { error: error.message }

  const { data } = await supabase
    .from('tickets')
    .select('ref')
    .eq('project_id', context.project.id)
    .eq('created_by', context.profile.id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  revalidatePath(projectPath(slug))
  redirect(data ? projectPath(slug, `/tickets/${data.ref}`) : projectPath(slug))
}

export async function updateTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = Number(formData.get('id'))
  if (!id) return { error: 'Fitxa no vàlida.' }

  const loaded = await loadTicketContext(id)
  if (!loaded) return { error: 'Fitxa no trobada.' }
  const { ticket, context } = loaded
  if (!canEditTicket(context.access, ticket)) {
    return { error: 'No tens permís per editar aquesta fitxa.' }
  }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'El nom curt és obligatori.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tickets')
    .update({ title, ...ticketFields(formData) })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidateTicket(context.project.slug, ticket.ref)
  return { ok: true }
}

/** Marca o desmarca l'aprovació d'un dels tres actors.
 *
 * Aprovar i demanar revisió són excloents: qui aprova retira la seva petició de
 * revisió, i si el responsable retira la seva aprovació desapareixen totes dues
 * peticions (sense feina marcada com a feta no hi ha res a revisar). */
export async function setApproval(
  ticketId: number,
  actor: Actor,
  approve: boolean,
): Promise<FormState> {
  const loaded = await loadTicketContext(ticketId)
  if (!loaded) return { error: 'Fitxa no trobada.' }
  const { ticket, context } = loaded

  if (!canApprove(actor, context.access, ticket, context.teamCtx)) {
    return { error: 'No tens permís per canviar aquesta aprovació.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tickets')
    .update({
      [APPROVAL_COLUMN[actor]]: approve ? new Date().toISOString() : null,
      ...(actor === 'responsable' && !approve ? NO_REVIEWS : {}),
      ...(actor !== 'responsable' && approve ? { [REVIEW_COLUMN[actor]]: null } : {}),
    })
    .eq('id', ticketId)

  if (error) return { error: error.message }

  revalidateTicket(context.project.slug, ticket.ref)
  return { ok: true }
}

/** El tècnic o el propietari demanen (o desfan) la revisió de la feina: la
 * fitxa passa a «A revisar» i torna a mans del responsable. */
export async function setReview(
  ticketId: number,
  actor: ReviewActor,
  request: boolean,
): Promise<FormState> {
  const loaded = await loadTicketContext(ticketId)
  if (!loaded) return { error: 'Fitxa no trobada.' }
  const { ticket, context } = loaded

  if (!canRequestReview(actor, context.access, ticket, context.teamCtx)) {
    return { error: 'No tens permís per demanar la revisió d’aquesta fitxa.' }
  }
  if (request && !ticket.approved_responsable_at) {
    return { error: 'Només es pot demanar revisió quan el responsable ha marcat la feina com a feta.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tickets')
    .update({
      [REVIEW_COLUMN[actor]]: request ? new Date().toISOString() : null,
      ...(request ? { [APPROVAL_COLUMN[actor]]: null } : {}),
    })
    .eq('id', ticketId)

  if (error) return { error: error.message }

  revalidateTicket(context.project.slug, ticket.ref)
  return { ok: true }
}

/** El responsable torna a marcar com a feta una fitxa «A revisar»: es retiren
 * les peticions de revisió i es reinicien les aprovacions del tècnic i del
 * propietari, que han de tornar a dir-hi la seva. */
export async function markReviewed(ticketId: number): Promise<FormState> {
  const loaded = await loadTicketContext(ticketId)
  if (!loaded) return { error: 'Fitxa no trobada.' }
  const { ticket, context } = loaded

  if (!canMarkReviewed(context.access, ticket, context.teamCtx)) {
    return { error: 'No tens permís per canviar aquesta aprovació.' }
  }
  if (!ticket.review_tecnics_at && !ticket.review_propietari_at) {
    return { error: 'Aquesta fitxa no està pendent de revisió.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tickets')
    .update({
      approved_responsable_at: new Date().toISOString(),
      approved_tecnics_at: null,
      approved_propietari_at: null,
      ...NO_REVIEWS,
    })
    .eq('id', ticketId)

  if (error) return { error: error.message }

  revalidateTicket(context.project.slug, ticket.ref)
  return { ok: true }
}

export async function createComment(
  ticketId: number,
  body: string,
  imagePaths: string[],
): Promise<FormState> {
  const loaded = await loadTicketContext(ticketId)
  if (!loaded) return { error: 'Fitxa no trobada.' }
  const { ticket, context } = loaded

  if (!canCommentTicket(context.access, ticket, context.teamCtx)) {
    return { error: 'No tens permís per comentar aquesta fitxa.' }
  }

  const text = body.trim()
  if (!text && imagePaths.length === 0) {
    return { error: 'Escriu un comentari o adjunta una imatge.' }
  }

  const supabase = await createClient()
  const { data: comment, error } = await supabase
    .from('comments')
    .insert({ ticket_id: ticketId, author_id: context.profile.id, body: text || null })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (imagePaths.length > 0) {
    const { error: imgError } = await supabase
      .from('comment_images')
      .insert(imagePaths.map((storage_path) => ({ comment_id: comment.id, storage_path })))
    if (imgError) return { error: `Comentari desat, però les imatges han fallat: ${imgError.message}` }
  }

  revalidateTicket(context.project.slug, ticket.ref)
  return { ok: true }
}

/** Esborra un comentari. L'RLS només ho permet a l'autor o a qui administra el
 * projecte. */
export async function deleteComment(formData: FormData): Promise<void> {
  const commentId = String(formData.get('comment_id') ?? '')
  const ticketId = Number(formData.get('ticket_id'))
  if (!commentId || !ticketId) return

  const loaded = await loadTicketContext(ticketId)
  if (!loaded) return
  const { ticket, context } = loaded

  const supabase = await createClient()

  // Les imatges de Storage no cauen amb el ON DELETE CASCADE de la taula.
  const { data: images } = await supabase
    .from('comment_images')
    .select('storage_path')
    .eq('comment_id', commentId)

  await supabase.from('comments').delete().eq('id', commentId)

  const paths = (images ?? []).map((i: { storage_path: string }) => i.storage_path)
  if (paths.length > 0) {
    await supabase.storage.from('ticket-images').remove(paths)
  }

  revalidateTicket(context.project.slug, ticket.ref)
}

/** Adjunta imatges ja pujades a Storage a la descripció o la solució proposada. */
export async function addFieldImages(
  ticketId: number,
  field: TicketImageField,
  storagePaths: string[],
): Promise<FormState> {
  if (storagePaths.length === 0) return { ok: true }

  const loaded = await loadTicketContext(ticketId)
  if (!loaded) return { error: 'Fitxa no trobada.' }
  const { ticket, context } = loaded
  if (!canEditTicket(context.access, ticket)) {
    return { error: 'No tens permís per editar aquesta fitxa.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('ticket_field_images')
    .insert(storagePaths.map((storage_path) => ({ ticket_id: ticketId, field, storage_path })))

  if (error) return { error: error.message }

  revalidateTicket(context.project.slug, ticket.ref)
  return { ok: true }
}

/** Esborra una imatge adjunta a la descripció o la solució proposada.
 * L'esborrat el crida directament el component (no un <form>): dins del
 * formulari d'edició de la fitxa un form niat no és HTML vàlid. */
export async function deleteFieldImage(imageId: string, ticketId: number): Promise<FormState> {
  if (!imageId || !ticketId) return { error: 'Imatge no vàlida.' }

  const loaded = await loadTicketContext(ticketId)
  if (!loaded) return { error: 'Fitxa no trobada.' }
  const { ticket, context } = loaded
  if (!canEditTicket(context.access, ticket)) {
    return { error: 'No tens permís per editar aquesta fitxa.' }
  }

  const supabase = await createClient()
  const { data: image } = await supabase
    .from('ticket_field_images')
    .select('storage_path')
    .eq('id', imageId)
    .maybeSingle()

  const { error } = await supabase.from('ticket_field_images').delete().eq('id', imageId)
  if (error) return { error: error.message }

  if (image?.storage_path) {
    await supabase.storage.from('ticket-images').remove([image.storage_path])
  }

  revalidateTicket(context.project.slug, ticket.ref)
  return { ok: true }
}

export async function deleteTicket(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'))
  if (!id) return

  const loaded = await loadTicketContext(id)
  if (!loaded) return
  const { context } = loaded
  if (!canManageProject(context.access)) return

  const supabase = await createClient()
  await supabase.from('tickets').delete().eq('id', id)

  revalidatePath(projectPath(context.project.slug))
  redirect(projectPath(context.project.slug))
}
