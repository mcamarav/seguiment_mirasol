import type { Actor, Profile, ProjectMember, ReviewActor } from '@/lib/types'
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

/** Administrador de la instal·lació: l'únic permís que no depèn del projecte.
 * Crea projectes, convida gent i ho pot fer tot a tot arreu. */
export function isAdmin(profile: Profile): boolean {
  return profile.is_admin
}

/** Què pot fer una persona dins d'UN projecte. Es construeix amb `accessFor()`
 * a partir del seu perfil i de la seva fila de `project_members`; totes les
 * funcions de permisos d'aquest fitxer treballen amb això, així que ningú pot
 * comprovar permisos sense dir de quin projecte parla. */
export interface Access {
  userId: string
  /** Administrador de la instal·lació: ho pot tot a qualsevol projecte. */
  isAdmin: boolean
  /** Administra aquest projecte. */
  isManager: boolean
  canCreate: boolean
  canEditAll: boolean
}

export function accessFor(profile: Profile, member: ProjectMember | null): Access {
  return {
    userId: profile.id,
    isAdmin: profile.is_admin,
    isManager: member?.is_manager ?? false,
    canCreate: member?.can_create ?? false,
    canEditAll: member?.can_edit_all ?? false,
  }
}

/** Administra el projecte: membres, equips, zones i tipus, i pot aprovar en nom
 * de qualsevol actor. */
export function canManageProject(access: Access): boolean {
  return access.isAdmin || access.isManager
}

export function canCreateTickets(access: Access): boolean {
  return canManageProject(access) || access.canCreate
}

/** Qui l'ha creada la pot editar sempre; a més, qui administra el projecte i qui
 * hi té permís d'editar-ho tot. */
export function canEditTicket(access: Access, ticket: { created_by: string | null }): boolean {
  return canManageProject(access) || access.canEditAll || ticket.created_by === access.userId
}

type TicketAssignment = {
  created_by: string | null
  assignee_id: string | null
  assignee_team_id: number | null
}

/** Pot comentar la fitxa: qui la pot editar, qui hi és assignat, o qualsevol
 * membre dels equips globals de tècnics/propietaris del projecte.
 *
 * Veure-la és una altra cosa i no es pregunta aquí: qui té accés al projecte
 * veu totes les seves fitxes (ho decideix l'RLS amb can_view_ticket). */
export function canCommentTicket(
  access: Access,
  ticket: TicketAssignment,
  ctx: TeamContext,
): boolean {
  return (
    canEditTicket(access, ticket) ||
    isAssignedToTicket(ticket, access.userId, ctx) ||
    isInGlobalTeam(ctx, 'tecnics') ||
    isInGlobalTeam(ctx, 'propietaris')
  )
}

/** Qui pot marcar cada casella d'aprovació d'una fitxa concreta. */
export function canApprove(
  actor: Actor,
  access: Access,
  ticket: TicketAssignment,
  ctx: TeamContext,
): boolean {
  if (canManageProject(access)) return true
  if (actor === 'responsable') return isAssignedToTicket(ticket, access.userId, ctx)
  if (actor === 'tecnics') return isInGlobalTeam(ctx, 'tecnics')
  return isInGlobalTeam(ctx, 'propietaris')
}

/** Demanar (o desfer) la revisió té els mateixos permisos que aprovar la
 * casella corresponent: és l'altra cara de la mateixa decisió. */
export function canRequestReview(
  actor: ReviewActor,
  access: Access,
  ticket: TicketAssignment,
  ctx: TeamContext,
): boolean {
  return canApprove(actor, access, ticket, ctx)
}

/** Tornar a marcar com a feta una fitxa «A revisar»: ho fa el responsable. */
export function canMarkReviewed(
  access: Access,
  ticket: TicketAssignment,
  ctx: TeamContext,
): boolean {
  return canApprove('responsable', access, ticket, ctx)
}

export function approvalsFor(
  access: Access,
  ticket: TicketAssignment,
  ctx: TeamContext,
): Record<Actor, boolean> {
  return {
    responsable: canApprove('responsable', access, ticket, ctx),
    tecnics: canApprove('tecnics', access, ticket, ctx),
    propietari: canApprove('propietari', access, ticket, ctx),
  }
}
