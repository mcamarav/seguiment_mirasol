'use client'

import { useActionState } from 'react'
import { signIn, signUp, type AuthState } from './auth-actions'
import { SubmitButton } from '@/components/SubmitButton'
import Link from 'next/link'

export function AuthForm({ mode }: { mode: 'entrar' | 'registre' }) {
  const action = mode === 'entrar' ? signIn : signUp
  const [state, formAction] = useActionState<AuthState, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-4">
      {mode === 'registre' && (
        <div>
          <label className="field-label" htmlFor="full_name">
            Nom
          </label>
          <input
            id="full_name"
            name="full_name"
            className="field"
            autoComplete="name"
            placeholder="Nom i cognom"
          />
        </div>
      )}

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

      <div>
        <label className="field-label" htmlFor="password">
          Contrasenya
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="field"
          autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
          minLength={mode === 'registre' ? 8 : undefined}
        />
        {mode === 'entrar' && (
          <Link
            href="/recuperar"
            className="mt-1.5 inline-block text-xs font-semibold text-[var(--color-brand)]"
          >
            Has oblidat la contrasenya?
          </Link>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.notice && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.notice}
        </p>
      )}

      <SubmitButton className="btn btn-primary w-full" pendingLabel="Un moment…">
        {mode === 'entrar' ? 'Entrar' : 'Crear el compte'}
      </SubmitButton>

      <p className="text-center text-sm text-[var(--color-muted)]">
        {mode === 'entrar' ? (
          <>
            No tens compte?{' '}
            <Link href="/registre" className="font-semibold text-[var(--color-brand)]">
              Registra&apos;t
            </Link>
          </>
        ) : (
          <>
            Ja tens compte?{' '}
            <Link href="/entrar" className="font-semibold text-[var(--color-brand)]">
              Entra
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
