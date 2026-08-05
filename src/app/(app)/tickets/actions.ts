'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { canApprove, canCommentTicket, canCreateTickets, canEditTicket, isAdmin } from '@/lib/permissions'
import { buildTeamContext, toTeamsWithMembers } from '@/lib/teams'
import type { Actor, Profile, TicketImageField } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface FormState {
  error?: string
  ok?: boolean
}

const APPROVAL_COLUMN: Record<Actor, string> = {
  responsable: 'approved_responsable_at',
  tecnics: 'approved_tecnics_at',
  propietari: 'approved_propietari_at',
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTeamContext(supabase: SupabaseClient<any>, profile: Profile) {
  const { data } = await supabase
    .from('teams')
    .select('id, name, global_role, created_at, team_members(user_id)')
  return buildTeamContext(toTeamsWithMembers(data ?? []), profile.id)
}

async function loadTicket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  ticketId: number,
) {
  const { data } = await supabase
    .from('tickets')
    .select('id, created_by, assignee_id, assignee_team_id')
    .eq('id', ticketId)
    .maybeSingle()
  return data
}

export async function createTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getCurrentProfile()
  if (!profile) return { error: 'Sessió caducada.' }
  if (!canCreateTickets(profile)) return { error: 'No tens permís per crear fitxes.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'El nom curt és obligatori.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tickets')
    .insert({
      title,
      description: optional(formData, 'description'),
      zone_id: optionalId(formData, 'zone_id'),
      work_type_id: optionalId(formData, 'work_type_id'),
      agreed_solution: optional(formData, 'agreed_solution'),
      due_date: optional(formData, 'due_date'),
      ...parseAssignee(formData),
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/')
  redirect(`/tickets/${data.id}`)
}

export async function updateTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getCurrentProfile()
  if (!profile) return { error: 'Sessió caducada.' }

  const id = Number(formData.get('id'))
  if (!id) return { error: 'Fitxa no vàlida.' }

  const supabase = await createClient()
  const ticket = await loadTicket(supabase, id)
  if (!ticket) return { error: 'Fitxa no trobada.' }
  if (!canEditTicket(profile, ticket)) return { error: 'No tens permís per editar aquesta fitxa.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'El nom curt és obligatori.' }

  const { error } = await supabase
    .from('tickets')
    .update({
      title,
      description: optional(formData, 'description'),
      zone_id: optionalId(formData, 'zone_id'),
      work_type_id: optionalId(formData, 'work_type_id'),
      agreed_solution: optional(formData, 'agreed_solution'),
      due_date: optional(formData, 'due_date'),
      ...parseAssignee(formData),
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath(`/tickets/${id}`)
  return { ok: true }
}

/** Marca o desmarca l'aprovació d'un dels tres actors. */
export async function setApproval(
  ticketId: number,
  actor: Actor,
  approve: boolean,
): Promise<FormState> {
  const profile = await getCurrentProfile()
  if (!profile) return { error: 'Sessió caducada.' }

  const supabase = await createClient()
  const ticket = await loadTicket(supabase, ticketId)
  if (!ticket) return { error: 'Fitxa no trobada.' }

  const ctx = await loadTeamContext(supabase, profile)
  if (!canApprove(actor, profile, ticket, ctx)) {
    return { error: 'No tens permís per canviar aquesta aprovació.' }
  }

  const { error } = await supabase
    .from('tickets')
    .update({ [APPROVAL_COLUMN[actor]]: approve ? new Date().toISOString() : null })
    .eq('id', ticketId)

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

export async function createComment(
  ticketId: number,
  body: string,
  imagePaths: string[],
): Promise<FormState> {
  const profile = await getCurrentProfile()
  if (!profile) return { error: 'Sessió caducada.' }

  const supabase = await createClient()
  const ticket = await loadTicket(supabase, ticketId)
  if (!ticket) return { error: 'Fitxa no trobada.' }

  const ctx = await loadTeamContext(supabase, profile)
  if (!canCommentTicket(profile, ticket, ctx)) {
    return { error: 'No tens permís per comentar aquesta fitxa.' }
  }

  const text = body.trim()
  if (!text && imagePaths.length === 0) {
    return { error: 'Escriu un comentari o adjunta una imatge.' }
  }

  const { data: comment, error } = await supabase
    .from('comments')
    .insert({ ticket_id: ticketId, author_id: profile.id, body: text || null })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (imagePaths.length > 0) {
    const { error: imgError } = await supabase
      .from('comment_images')
      .insert(imagePaths.map((storage_path) => ({ comment_id: comment.id, storage_path })))
    if (imgError) return { error: `Comentari desat, però les imatges han fallat: ${imgError.message}` }
  }

  revalidatePath('/')
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

/** Esborra un comentari. L'RLS només ho permet a l'autor o a un admin. */
export async function deleteComment(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile()
  if (!profile) return

  const commentId = String(formData.get('comment_id') ?? '')
  const ticketId = Number(formData.get('ticket_id'))
  if (!commentId || !ticketId) return

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

  revalidatePath(`/tickets/${ticketId}`)
}

/** Adjunta imatges ja pujades a Storage a la descripció o la solució proposada. */
export async function addFieldImages(
  ticketId: number,
  field: TicketImageField,
  storagePaths: string[],
): Promise<FormState> {
  const profile = await getCurrentProfile()
  if (!profile) return { error: 'Sessió caducada.' }
  if (storagePaths.length === 0) return { ok: true }

  const supabase = await createClient()
  const ticket = await loadTicket(supabase, ticketId)
  if (!ticket || !canEditTicket(profile, ticket)) {
    return { error: 'No tens permís per editar aquesta fitxa.' }
  }

  const { error } = await supabase
    .from('ticket_field_images')
    .insert(storagePaths.map((storage_path) => ({ ticket_id: ticketId, field, storage_path })))

  if (error) return { error: error.message }

  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

/** Esborra una imatge adjunta a la descripció o la solució proposada. */
export async function deleteFieldImage(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile()
  if (!profile) return

  const imageId = String(formData.get('image_id') ?? '')
  const ticketId = Number(formData.get('ticket_id'))
  if (!imageId || !ticketId) return

  const supabase = await createClient()
  const ticket = await loadTicket(supabase, ticketId)
  if (!ticket || !canEditTicket(profile, ticket)) return

  const { data: image } = await supabase
    .from('ticket_field_images')
    .select('storage_path')
    .eq('id', imageId)
    .maybeSingle()

  await supabase.from('ticket_field_images').delete().eq('id', imageId)

  if (image?.storage_path) {
    await supabase.storage.from('ticket-images').remove([image.storage_path])
  }

  revalidatePath(`/tickets/${ticketId}`)
}

export async function deleteTicket(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile()
  if (!profile || !isAdmin(profile)) return

  const id = Number(formData.get('id'))
  if (!id) return

  const supabase = await createClient()
  await supabase.from('tickets').delete().eq('id', id)

  revalidatePath('/')
  redirect('/')
}
