import type { TeamWithMembers } from '@/lib/types'

export interface TeamContext {
  teams: TeamWithMembers[]
  myTeamIds: Set<number>
  tecnicsTeam: TeamWithMembers | null
  propietarisTeam: TeamWithMembers | null
}

export function buildTeamContext(teams: TeamWithMembers[], userId: string): TeamContext {
  return {
    teams,
    myTeamIds: new Set(teams.filter((t) => t.member_ids.includes(userId)).map((t) => t.id)),
    tecnicsTeam: teams.find((t) => t.global_role === 'tecnics') ?? null,
    propietarisTeam: teams.find((t) => t.global_role === 'propietaris') ?? null,
  }
}

/** L'equip (o la persona) assignat a la fitxa inclou l'usuari? */
export function isAssignedToTicket(
  ticket: { assignee_id: string | null; assignee_team_id: number | null },
  userId: string,
  ctx: TeamContext,
): boolean {
  if (ticket.assignee_id === userId) return true
  return ticket.assignee_team_id != null && ctx.myTeamIds.has(ticket.assignee_team_id)
}

export function isInGlobalTeam(ctx: TeamContext, globalRole: 'tecnics' | 'propietaris'): boolean {
  const team = globalRole === 'tecnics' ? ctx.tecnicsTeam : ctx.propietarisTeam
  return team != null && ctx.myTeamIds.has(team.id)
}

/** Equips pre-assignats a cada invitació pendent, agrupats per correu. */
export function toInvitationTeamsMap(rows: { email: string; team_id: number }[]): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const r of rows) {
    const list = map.get(r.email)
    if (list) list.push(r.team_id)
    else map.set(r.email, [r.team_id])
  }
  return map
}

/** Shape que retorna `select('id, name, global_role, created_at, team_members(user_id)')`. */
export function toTeamsWithMembers(
  rows: { id: number; name: string; global_role: string | null; created_at: string; team_members: { user_id: string }[] }[],
): TeamWithMembers[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    global_role: r.global_role as TeamWithMembers['global_role'],
    created_at: r.created_at,
    member_ids: r.team_members.map((m) => m.user_id),
  }))
}
