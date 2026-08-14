import type { Actor, Profile, ReviewActor } from '@/lib/types'
import { isAssignedToTicket, isInGlobalTeam, type TeamContext } from '@/lib/teams'

export const ACTOR_LABELS: Record<Actor, string> = {
  responsable: 'Responsable',
  tecnics: 'Tècnics',
  propietari: 'Propietari',
}

export const ACTORS: Actor[] = ['responsable', 'tecnics', 'propietari']

/** Els actors que poden demanar revisió (tots menys el responsable, que és qui
 * l'ha de resoldre). */
export const REVIEW_ACTORS: ReviewActor[] = ['tecnics', 'propietari']

export function isReviewActor(actor: Actor): actor is ReviewActor {
  return actor !== 'responsable'
}

export function isAdmin(profile: Profile): boolean {
  return profile.is_admin
}

export function canCreateTickets(profile: Profile): boolean {
  return profile.is_admin || profile.can_create
}

/** Qui l'ha creada la pot editar sempre; a més, l'admin i qui té permís global. */
export function canEditTicket(profile: Profile, ticket: { created_by: string | null }): boolean {
  return profile.is_admin || profile.can_edit_all || ticket.created_by === profile.id
}

type TicketAssignment = {
  created_by: string | null
  assignee_id: string | null
  assignee_team_id: number | null
}

/** Pot comentar (i per tant veure) la fitxa: qui la pot editar, qui hi és
 * assignat, o qualsevol membre dels equips globals de tècnics/propietaris. */
export function canCommentTicket(
  profile: Profile,
  ticket: TicketAssignment,
  ctx: TeamContext,
): boolean {
  return (
    canEditTicket(profile, ticket) ||
    isAssignedToTicket(ticket, profile.id, ctx) ||
    isInGlobalTeam(ctx, 'tecnics') ||
    isInGlobalTeam(ctx, 'propietaris')
  )
}

/** Qui pot marcar cada casella d'aprovació d'una fitxa concreta. */
export function canApprove(
  actor: Actor,
  profile: Profile,
  ticket: TicketAssignment,
  ctx: TeamContext,
): boolean {
  if (profile.is_admin) return true
  if (actor === 'responsable') return isAssignedToTicket(ticket, profile.id, ctx)
  if (actor === 'tecnics') return isInGlobalTeam(ctx, 'tecnics')
  return isInGlobalTeam(ctx, 'propietaris')
}

/** Demanar (o desfer) la revisió té els mateixos permisos que aprovar la
 * casella corresponent: és l'altra cara de la mateixa decisió. */
export function canRequestReview(
  actor: ReviewActor,
  profile: Profile,
  ticket: TicketAssignment,
  ctx: TeamContext,
): boolean {
  return canApprove(actor, profile, ticket, ctx)
}

/** Tornar a marcar com a feta una fitxa «A revisar»: ho fa el responsable. */
export function canMarkReviewed(
  profile: Profile,
  ticket: TicketAssignment,
  ctx: TeamContext,
): boolean {
  return canApprove('responsable', profile, ticket, ctx)
}

export function approvalsFor(
  profile: Profile,
  ticket: TicketAssignment,
  ctx: TeamContext,
): Record<Actor, boolean> {
  return {
    responsable: canApprove('responsable', profile, ticket, ctx),
    tecnics: canApprove('tecnics', profile, ticket, ctx),
    propietari: canApprove('propietari', profile, ticket, ctx),
  }
}
