'use client'

import { useActionState } from 'react'
import { updateFullName, updatePassword, type ProfileFormState } from './actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { Profile } from '@/lib/types'

const INITIAL_STATE: ProfileFormState = {}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [nameState, nameAction] = useActionState(updateFullName, INITIAL_STATE)
  const [passwordState, passwordAction] = useActionState(updatePassword, INITIAL_STATE)

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h2 className="font-semibold">Dades del compte</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          El correu ({profile.email}) no es pot canviar des d’aquí.
        </p>

        <form action={nameAction} className="mt-3 flex flex-wrap gap-2">
          <input
            name="full_name"
            defaultValue={profile.full_name ?? ''}
            required
            className="field min-w-0 flex-1"
            placeholder="Nom i cognom"
            aria-label="Nom"
          />
          <SubmitButton className="btn btn-secondary shrink-0" pendingLabel="Desant…">
            Desar
          </SubmitButton>
        </form>

        {nameState.error && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{nameState.error}</p>
        )}
        {nameState.notice && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {nameState.notice}
          </p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">Canviar contrasenya</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Com a mínim 8 caràcters.
        </p>

        <form action={passwordAction} className="mt-3 space-y-2">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field"
            placeholder="Contrasenya nova"
            aria-label="Contrasenya nova"
          />
          <input
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field"
            placeholder="Repeteix la contrasenya nova"
            aria-label="Repeteix la contrasenya nova"
          />
          <SubmitButton className="btn btn-primary" pendingLabel="Canviant…">
            Canviar contrasenya
          </SubmitButton>
        </form>

        {passwordState.error && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {passwordState.error}
          </p>
        )}
        {passwordState.notice && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {passwordState.notice}
          </p>
        )}
      </section>
    </div>
  )
}
