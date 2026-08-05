import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { canCreateTickets } from '@/lib/permissions'
import { toTeamsWithMembers } from '@/lib/teams'
import { TicketForm } from '../TicketForm'
import type { Profile, WorkType, Zone } from '@/lib/types'

export default async function NovaFitxaPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')
  if (!canCreateTickets(profile)) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold">Nova fitxa</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          No tens permís per crear fitxes. Parla amb l’administrador.
        </p>
        <Link href="/" className="btn btn-secondary mt-4">
          Tornar
        </Link>
      </div>
    )
  }

  const supabase = await createClient()
  const [{ data: zones }, { data: workTypes }, { data: profiles }, { data: teamRows }] = await Promise.all([
    supabase.from('zones').select('*').eq('active', true).order('sort_order'),
    supabase.from('work_types').select('*').eq('active', true).order('sort_order'),
    supabase.from('profiles').select('id, email, full_name, is_admin, can_create, can_edit_all, created_at'),
    supabase.from('teams').select('id, name, global_role, created_at, team_members(user_id)'),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-xl font-bold tracking-tight">Nova fitxa</h1>
        <Link href="/" className="text-sm font-semibold text-[var(--color-muted)]">
          Cancel·lar
        </Link>
      </div>
      <TicketForm
        zones={(zones ?? []) as Zone[]}
        workTypes={(workTypes ?? []) as WorkType[]}
        assignees={(profiles ?? []) as Profile[]}
        teams={toTeamsWithMembers(teamRows ?? [])}
      />
    </div>
  )
}
