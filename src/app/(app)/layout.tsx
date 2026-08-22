import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import { displayName } from '@/lib/format'
import { signOut } from '../auth-actions'
import { SubmitButton } from '@/components/SubmitButton'
import Link from 'next/link'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link href="/" className="mr-auto min-w-0">
            <span className="block truncate text-base font-bold tracking-tight">
              Seguiment d’obres
            </span>
            <span className="block truncate text-xs text-[var(--color-muted)]">
              {displayName(profile)} {profile.is_admin ? '· Administrador' : ''}
            </span>
          </Link>

          <Link href="/perfil" className="text-sm font-semibold text-[var(--color-muted)]">
            Perfil
          </Link>

          {isAdmin(profile) && (
            <Link href="/admin" className="text-sm font-semibold text-[var(--color-brand)]">
              Admin
            </Link>
          )}

          <form action={signOut}>
            <SubmitButton
              className="text-sm font-semibold text-[var(--color-muted)]"
              pendingLabel="Sortint…"
            >
              Sortir
            </SubmitButton>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5 pb-16">{children}</main>
    </div>
  )
}
