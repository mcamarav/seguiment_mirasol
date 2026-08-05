'use client'

import { useActionState } from 'react'
import { requestPasswordReset, type AuthState } from './auth-actions'
import { SubmitButton } from '@/components/SubmitButton'
import Link from 'next/link'

export function RecuperarForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(requestPasswordReset, {})

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="email">
          Correu electrònic
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="field"
          autoComplete="email"
          inputMode="email"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.notice && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.notice}
        </p>
      )}

      <SubmitButton className="btn btn-primary w-full" pendingLabel="Enviant…">
        Enviar enllaç de recuperació
      </SubmitButton>

      <p className="text-center text-sm text-[var(--color-muted)]">
        <Link href="/entrar" className="font-semibold text-[var(--color-brand)]">
          Torna a entrar
        </Link>
      </p>
    </form>
  )
}
