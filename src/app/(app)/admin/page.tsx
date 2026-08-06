import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import { toInvitationTeamsMap, toTeamsWithMembers } from '@/lib/teams'
import { displayName, formatDate } from '@/lib/format'
import { AdminTabs } from './AdminTabs'
import { CatalogEditor } from './CatalogEditor'
import { InvitationsPanel } from './InvitationsPanel'
import { TeamsEditor } from './TeamsEditor'
import { setUserCapabilities, setUserTeams } from './actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { Invitation, Profile, WorkType, Zone } from '@/lib/types'

export default async function AdminPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')
  if (!isAdmin(profile)) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold">Administració</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Aquesta pantalla és només per a administradors.
        </p>
      </div>
    )
  }

  const supabase = await createClient()
  const [
    { data: profiles },
    { data: invitations },
    { data: invitationTeamRows },
    { data: zones },
    { data: workTypes },
    { data: teamRows },
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at'),
    supabase.from('invitations').select('*').order('created_at'),
    supabase.from('invitation_teams').select('email, team_id'),
    supabase.from('zones').select('*').order('sort_order'),
    supabase.from('work_types').select('*').order('sort_order'),
    supabase.from('teams').select('id, name, global_role, created_at, team_members(user_id)').order('created_at'),
  ])

  const allProfiles = (profiles ?? []) as Profile[]
  const teams = toTeamsWithMembers(teamRows ?? [])
  const invitationTeams = toInvitationTeamsMap(invitationTeamRows ?? [])

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Administració</h1>

      <AdminTabs
        convidats={
          <InvitationsPanel
            invitations={(invitations ?? []) as Invitation[]}
            teams={teams}
            invitationTeams={invitationTeams}
          />
        }
        usuaris={
          <section className="card p-4">
            <h2 className="font-semibold">Usuaris i permisos</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Permisos globals de cada compte. A qui ha creat una fitxa ja la pot editar encara
              que no tingui «Editar totes». Els equips també es poden gestionar per equip a la
              pestanya «Equips».
            </p>

            <ul className="mt-3 divide-y divide-[var(--color-line)]">
              {allProfiles.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{displayName(p)}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">
                      {p.email} · des del {formatDate(p.created_at)}
                    </p>
                  </div>
                  <form
                    action={setUserCapabilities}
                    className="flex shrink-0 flex-wrap items-center gap-3"
                  >
                    <input type="hidden" name="user_id" value={p.id} />
                    <label className="flex items-center gap-1.5 text-xs font-semibold">
                      <input type="checkbox" name="is_admin" defaultChecked={p.is_admin} />
                      Administrador
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold">
                      <input type="checkbox" name="can_create" defaultChecked={p.can_create} />
                      Crear fitxes
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold">
                      <input type="checkbox" name="can_edit_all" defaultChecked={p.can_edit_all} />
                      Editar totes
                    </label>
                    <SubmitButton className="btn btn-secondary" pendingLabel="…">
                      Aplicar
                    </SubmitButton>
                  </form>
                  {teams.length > 0 && (
                    <form action={setUserTeams} className="flex shrink-0 items-center gap-2">
                      <input type="hidden" name="user_id" value={p.id} />
                      <select
                        name="team_ids"
                        multiple
                        size={Math.min(5, teams.length)}
                        className="field h-auto min-w-[9rem] py-1"
                        aria-label={`Equips de ${displayName(p)}`}
                        defaultValue={teams
                          .filter((t) => t.member_ids.includes(p.id))
                          .map((t) => String(t.id))}
                      >
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="btn btn-secondary" pendingLabel="…">
                        Aplicar equips
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        }
        equips={<TeamsEditor teams={teams} profiles={allProfiles} />}
        catalegs={
          <div className="grid gap-5 sm:grid-cols-2">
            <CatalogEditor
              table="zones"
              title="Zones"
              hint="Les estances i espais de la casa. Amagar-ne una no afecta les fitxes existents."
              items={(zones ?? []) as Zone[]}
            />
            <CatalogEditor
              table="work_types"
              title="Tipus"
              hint="El tipus de treball: pintura, finestres, electricitat…"
              items={(workTypes ?? []) as WorkType[]}
            />
          </div>
        }
      />
    </div>
  )
}
