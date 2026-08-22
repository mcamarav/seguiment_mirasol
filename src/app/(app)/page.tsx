import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import { projectPath } from '@/lib/routes'
import type { Project } from '@/lib/types'

/** Comptadors per projecte, per no entrar a cegues. Es calculen amb els mateixos
 * criteris que les pestanyes de la llista de fitxes. */
type Counts = { total: number; pendents: number; resoltes: number }

export default async function ProjectesPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')

  const supabase = await createClient()
  const [{ data: projectRows }, { data: ticketRows }] = await Promise.all([
    supabase.from('projects').select('id, slug, name, active, created_at').order('name'),
    // L'RLS ja limita les fitxes als projectes on l'usuari té accés.
    supabase.from('ticket_list').select('project_id, status, approved_responsable_at'),
  ])

  const projects = (projectRows ?? []) as Project[]
  const visible = projects.filter((p) => p.active || isAdmin(profile))

  // Amb un sol projecte el selector només seria una passa de més.
  if (visible.length === 1) redirect(projectPath(visible[0].slug))

  const counts = new Map<number, Counts>()
  for (const row of (ticketRows ?? []) as {
    project_id: number
    status: string
    approved_responsable_at: string | null
  }[]) {
    const c = counts.get(row.project_id) ?? { total: 0, pendents: 0, resoltes: 0 }
    c.total += 1
    if (row.status === 'resolt') c.resoltes += 1
    else if (!row.approved_responsable_at || row.status === 'a_revisar') c.pendents += 1
    counts.set(row.project_id, c)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-xl font-bold tracking-tight">Projectes</h1>
        {isAdmin(profile) && (
          <Link href="/admin" className="btn btn-secondary">
            Gestionar projectes
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
          Encara no tens accés a cap projecte. Parla amb l’administrador.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((project) => {
            const c = counts.get(project.id) ?? { total: 0, pendents: 0, resoltes: 0 }
            return (
              <li key={project.id}>
                <Link
                  href={projectPath(project.slug)}
                  className="card block p-4 transition-colors hover:bg-[var(--color-brand-soft)]"
                >
                  <p className="font-semibold">
                    {project.name}
                    {!project.active && (
                      <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                        (amagat)
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {c.total === 0
                      ? 'Cap fitxa encara'
                      : `${c.total} ${c.total === 1 ? 'fitxa' : 'fitxes'} · ${c.pendents} pendents · ${c.resoltes} resoltes`}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
