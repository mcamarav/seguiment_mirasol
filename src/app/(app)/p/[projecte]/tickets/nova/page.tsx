import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { canCreateTickets } from '@/lib/permissions'
import { loadProjectContext, loadProjectPeople } from '@/lib/project'
import { projectPath } from '@/lib/routes'
import { TicketForm } from '../TicketForm'
import type { WorkType, Zone } from '@/lib/types'

export default async function NovaFitxaPage({
  params,
}: {
  params: Promise<{ projecte: string }>
}) {
  const { projecte } = await params
  const context = await loadProjectContext(projecte)
  if (!context) notFound()

  const { project, access, teams } = context

  if (!canCreateTickets(access)) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold">Nova fitxa</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          No tens permís per crear fitxes en aquest projecte. Parla amb qui l’administra.
        </p>
        <Link href={projectPath(project.slug)} className="btn btn-secondary mt-4">
          Tornar
        </Link>
      </div>
    )
  }

  const supabase = await createClient()
  const [{ data: zones }, { data: workTypes }, people] = await Promise.all([
    supabase.from('zones').select('*').eq('project_id', project.id).eq('active', true).order('sort_order'),
    supabase.from('work_types').select('*').eq('project_id', project.id).eq('active', true).order('sort_order'),
    loadProjectPeople(project.id),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-xl font-bold tracking-tight">Nova fitxa</h1>
        <Link
          href={projectPath(project.slug)}
          className="text-sm font-semibold text-[var(--color-muted)]"
        >
          Cancel·lar
        </Link>
      </div>
      <TicketForm
        slug={project.slug}
        zones={(zones ?? []) as Zone[]}
        workTypes={(workTypes ?? []) as WorkType[]}
        assignees={people.map((p) => p.profile)}
        teams={teams}
      />
    </div>
  )
}
