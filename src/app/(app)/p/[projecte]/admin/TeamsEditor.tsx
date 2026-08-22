import { displayName } from '@/lib/format'
import {
  createTeam,
  deleteTeam,
  renameTeam,
  setTeamGlobalRole,
  toggleTeamMembership,
} from './actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { Profile, TeamWithMembers } from '@/lib/types'

const GLOBAL_ROLE_LABELS = {
  tecnics: 'Tècnics',
  propietaris: 'Propietaris',
} as const

export function TeamsEditor({
  slug,
  teams,
  profiles,
}: {
  slug: string
  teams: TeamWithMembers[]
  /** Només la gent que té accés al projecte: la base de dades no deixa posar
   * ningú altre en un equip. */
  profiles: Profile[]
}) {
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Equips</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Els equips són d’aquest projecte. Una persona pot pertànyer a diversos equips, i tenir
        equips diferents a cada projecte. Un equip amb rol global (Tècnics o Propietaris) aprova
        aquella casella i veu totes les fitxes del projecte, no només les assignades. La casella
        «Responsable» l’aprova qui tingui la fitxa assignada — a «Assignat a», dins de cada
        fitxa.
      </p>

      <form action={createTeam} className="mt-3 flex gap-2">
        <input type="hidden" name="projecte" value={slug} />
        <input name="name" required className="field" placeholder="Nom de l’equip nou…" />
        <SubmitButton className="btn btn-secondary shrink-0" pendingLabel="Creant…">
          Crear equip
        </SubmitButton>
      </form>

      <ul className="mt-4 space-y-4">
        {teams.map((team) => (
          <li key={team.id} className="rounded-xl border border-[var(--color-line)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <form action={renameTeam} className="flex min-w-0 flex-1 gap-2">
                <input type="hidden" name="projecte" value={slug} />
                <input type="hidden" name="id" value={team.id} />
                <input name="name" defaultValue={team.name} className="field" />
                <SubmitButton
                  className="shrink-0 text-xs font-semibold text-[var(--color-brand)]"
                  pendingLabel="…"
                >
                  Desar
                </SubmitButton>
              </form>
              <form action={deleteTeam} className="shrink-0">
                <input type="hidden" name="projecte" value={slug} />
                <input type="hidden" name="id" value={team.id} />
                <SubmitButton
                  className="text-xs font-semibold text-[var(--color-muted)] hover:text-red-700"
                  pendingLabel="…"
                >
                  Esborrar equip
                </SubmitButton>
              </form>
            </div>

            <form action={setTeamGlobalRole} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="projecte" value={slug} />
              <input type="hidden" name="id" value={team.id} />
              <select
                name="global_role"
                defaultValue={team.global_role ?? ''}
                className="field w-auto"
                aria-label={`Rol global de ${team.name}`}
              >
                <option value="">Sense rol global</option>
                <option value="tecnics">Rol global: Tècnics</option>
                <option value="propietaris">Rol global: Propietaris</option>
              </select>
              <SubmitButton className="btn btn-secondary shrink-0" pendingLabel="…">
                Aplicar
              </SubmitButton>
              {team.global_role && (
                <span className="text-xs text-[var(--color-muted)]">
                  Aprova {GLOBAL_ROLE_LABELS[team.global_role]} a totes les fitxes del projecte
                </span>
              )}
            </form>

            <p className="field-label mt-3">Membres ({team.member_ids.length})</p>
            <ul className="flex flex-wrap gap-1.5">
              {profiles.map((p) => {
                const isMember = team.member_ids.includes(p.id)
                return (
                  <li key={p.id}>
                    <form action={toggleTeamMembership}>
                      <input type="hidden" name="projecte" value={slug} />
                      <input type="hidden" name="team_id" value={team.id} />
                      <input type="hidden" name="user_id" value={p.id} />
                      <input type="hidden" name="is_member" value={String(isMember)} />
                      <SubmitButton
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          isMember
                            ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                            : 'border-[var(--color-line)] text-[var(--color-muted)]'
                        }`}
                        pendingLabel="…"
                      >
                        {displayName(p)}
                      </SubmitButton>
                    </form>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>

      {teams.length === 0 && (
        <p className="mt-3 text-sm text-[var(--color-muted)]">Encara no hi ha cap equip.</p>
      )}
    </section>
  )
}
