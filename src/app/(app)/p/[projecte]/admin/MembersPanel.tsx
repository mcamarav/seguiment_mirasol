import { displayName, formatDate } from '@/lib/format'
import { addProjectMember, removeProjectMember, setMemberCapabilities } from './actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { Profile, ProjectMember } from '@/lib/types'

/** Qui té accés a aquest projecte i amb quins permisos. Sense fila aquí, la
 * persona no en veu absolutament res: ni fitxes, ni zones, ni equips. */
export function MembersPanel({
  slug,
  members,
  candidates,
}: {
  slug: string
  members: { profile: Profile; member: ProjectMember }[]
  /** Comptes que encara no tenen accés a aquest projecte. */
  candidates: Profile[]
}) {
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Qui té accés</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Els permisos són d’aquest projecte: la mateixa persona pot ser-hi responsable i només
        lectora a un altre. Qui hi té accés sense cap casella marcada hi pot mirar les fitxes
        (i comentar-hi les que tingui assignades o les del seu equip). Qui crea una fitxa la pot
        editar sempre.
      </p>

      <ul className="mt-3 divide-y divide-[var(--color-line)]">
        {members.map(({ profile, member }) => (
          <li key={profile.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {displayName(profile)}
                {profile.is_admin && (
                  <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                    administrador
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {profile.email} · hi té accés des del {formatDate(member.created_at)}
              </p>
            </div>

            <form
              action={setMemberCapabilities}
              className="flex shrink-0 flex-wrap items-center gap-3"
            >
              <input type="hidden" name="projecte" value={slug} />
              <input type="hidden" name="user_id" value={profile.id} />
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" name="is_manager" defaultChecked={member.is_manager} />
                Administrar
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" name="can_create" defaultChecked={member.can_create} />
                Crear fitxes
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" name="can_edit_all" defaultChecked={member.can_edit_all} />
                Editar totes
              </label>
              <SubmitButton className="btn btn-secondary" pendingLabel="…">
                Aplicar
              </SubmitButton>
            </form>

            <form action={removeProjectMember} className="shrink-0">
              <input type="hidden" name="projecte" value={slug} />
              <input type="hidden" name="user_id" value={profile.id} />
              <SubmitButton
                className="text-xs font-semibold text-[var(--color-muted)] hover:text-red-700"
                pendingLabel="…"
              >
                Treure del projecte
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>

      {members.length === 0 && (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Encara no hi ha ningú amb accés a aquest projecte.
        </p>
      )}

      <h3 className="field-label mt-5">Donar accés</h3>
      {candidates.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          No hi ha ningú més per afegir. Els comptes nous es creen convidant el correu des de
          l’administració general.
        </p>
      ) : (
        <form action={addProjectMember} className="flex flex-wrap gap-2">
          <input type="hidden" name="projecte" value={slug} />
          <select name="user_id" className="field w-auto" aria-label="Persona a afegir">
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)} · {p.email}
              </option>
            ))}
          </select>
          <SubmitButton className="btn btn-primary shrink-0" pendingLabel="Afegint…">
            Donar accés
          </SubmitButton>
        </form>
      )}
    </section>
  )
}
