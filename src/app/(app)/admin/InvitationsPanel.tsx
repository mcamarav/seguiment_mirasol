import { formatDate } from '@/lib/format'
import { inviteEmail, revokeInvitation } from './actions'
import type { Invitation } from '@/lib/types'

export function InvitationsPanel({ invitations }: { invitations: Invitation[] }) {
  const pending = invitations.filter((i) => !i.accepted_at)
  const used = invitations.filter((i) => i.accepted_at)

  return (
    <section className="card p-4">
      <h2 className="font-semibold">Convidats</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Només es pot registrar qui tingui el correu autoritzat aquí. Passa-li l’enllaç de l’app i
        ja es crearà la contrasenya ell mateix. Els equips i permisos es donen després, a «Usuaris
        i permisos» i «Equips».
      </p>

      <form action={inviteEmail} className="mt-3 grid gap-2 sm:grid-cols-[1.6fr_auto_auto]">
        <input
          name="email"
          type="email"
          required
          className="field"
          placeholder="correu@exemple.com"
          aria-label="Correu a convidar"
        />
        <label className="field flex w-auto items-center gap-1.5 text-sm font-semibold">
          <input type="checkbox" name="is_admin" />
          Administrador
        </label>
        <button type="submit" className="btn btn-primary shrink-0">
          Convidar
        </button>
        <input
          name="note"
          className="field sm:col-span-3"
          placeholder="Nota opcional (p. ex. «arquitecte», «paleta»)"
          aria-label="Nota"
        />
      </form>

      <h3 className="field-label mt-5">Pendents de registrar-se ({pending.length})</h3>
      {pending.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Cap invitació pendent.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {pending.map((inv) => (
            <li key={inv.email} className="flex flex-wrap items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{inv.email}</p>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {inv.is_admin ? 'Administrador' : 'Membre'}
                  {inv.note ? ` · ${inv.note}` : ''} · convidat el {formatDate(inv.created_at)}
                </p>
              </div>
              <form action={revokeInvitation} className="shrink-0">
                <input type="hidden" name="email" value={inv.email} />
                <button
                  type="submit"
                  className="text-xs font-semibold text-[var(--color-muted)] hover:text-red-700"
                >
                  Retirar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {used.length > 0 && (
        <>
          <h3 className="field-label mt-5">Ja registrats ({used.length})</h3>
          <ul className="text-sm text-[var(--color-muted)]">
            {used.map((inv) => (
              <li key={inv.email} className="truncate py-1">
                {inv.email} · {formatDate(inv.accepted_at)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Per canviar-los els permisos o els equips, fes-ho a <strong>Usuaris i permisos</strong>{' '}
            i <strong>Equips</strong> — la invitació ja només serveix d’històric.
          </p>
        </>
      )}
    </section>
  )
}
