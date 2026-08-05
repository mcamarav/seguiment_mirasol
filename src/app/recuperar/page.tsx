import { RecuperarForm } from '../RecuperarForm'

export default function RecuperarPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">Recuperar contrasenya</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Introdueix el teu correu i t’enviarem un enllaç per triar-ne una nova.
        </p>
      </div>
      <div className="card p-5">
        <RecuperarForm />
      </div>
    </main>
  )
}
