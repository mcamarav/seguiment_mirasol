import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'
import { ProfileForm } from './ProfileForm'

export default async function PerfilPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">El meu perfil</h1>
      <ProfileForm profile={profile} />
    </div>
  )
}
