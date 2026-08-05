'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { signIn, signUp, type AuthState } from './auth-actions'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? 'Un moment…' : label}
    </button>
  )
}

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
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.notice && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.notice}
        </p>
      )}

      <Submit label={mode === 'entrar' ? 'Entrar' : 'Crear el compte'} />

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
