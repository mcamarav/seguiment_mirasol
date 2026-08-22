import { AuthForm } from '../AuthForm'

export default function RegistrePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">Crear un compte</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          L’app és per invitació: només pots registrar-te si l’administrador ha autoritzat
          prèviament el teu correu. La invitació ja porta a quins projectes tindràs accés.
        </p>
      </div>
      <div className="card p-5">
        <AuthForm mode="registre" />
      </div>
    </main>
  )
}
