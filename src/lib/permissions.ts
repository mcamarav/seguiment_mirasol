import type { Actor, Profile } from '@/lib/types'
import { isAssignedToTicket, isInGlobalTeam, type TeamContext } from '@/lib/teams'

export const ACTOR_LABELS: Record<Actor, string> = {
  responsable: 'Responsable',
  tecnics: 'Tècnics',
  propietari: 'Propietari',
}

export const ACTORS: Actor[] = ['responsable', 'tecnics', 'propietari']

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
