import { AuthForm } from '../AuthForm'

export default function EntrarPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">Seguiment d’obres</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Tasques pendents de cada obra. Entra amb el teu correu.
        </p>
      </div>
      <div className="card p-5">
        <AuthForm mode="entrar" />
      </div>
    </main>
  )
}
