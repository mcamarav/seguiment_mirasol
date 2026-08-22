import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import { projectPath } from '@/lib/routes'
import { displayName, formatDate } from '@/lib/format'
import { AdminTabs } from '@/components/AdminTabs'
import { InvitationsPanel } from './InvitationsPanel'
import { ProjectsPanel } from './ProjectsPanel'
import { setUserAdmin } from './actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { Invitation, Profile, Project, ProjectMember } from '@/lib/types'

export default async function AdminPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')
  if (!isAdmin(profile)) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold">Administració</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Aquesta pantalla és només per a administradors. Si administres algun projecte, la seva
          administració és dins del projecte mateix.
        </p>
      </div>
    )
  }

  const supabase = await createClient()
  const [
    { data: projects },
    { data: profiles },
    { data: invitations },
    { data: invitationProjectRows },
    { data: memberRows },
    { data: ticketRows },
  ] = await Promise.all([
    supabase.from('projects').select('id, slug, name, active, created_at').order('name'),
    supabase.from('profiles').select('id, email, full_name, is_admin, created_at').order('created_at'),
    supabase.from('invitations').select('*').order('created_at'),
    supabase.from('invitation_projects').select('email, project_id'),
    supabase.from('project_members').select('project_id, user_id, is_manager, can_create, can_edit_all, created_at'),
    // Només per comptar-les: l'administrador les veu totes.
    supabase.from('tickets').select('project_id'),
  ])

  const allProjects = (projects ?? []) as Project[]
  const allProfiles = (profiles ?? []) as Profile[]
  const members = (memberRows ?? []) as ProjectMember[]

  const ticketCounts = new Map<number, number>()
  for (const row of (ticketRows ?? []) as { project_id: number }[]) {
    ticketCounts.set(row.project_id, (ticketCounts.get(row.project_id) ?? 0) + 1)
  }

  const memberCounts = new Map<number, number>()
  for (const m of members) {
    memberCounts.set(m.project_id, (memberCounts.get(m.project_id) ?? 0) + 1)
  }

  const invitationProjects = new Map<string, number[]>()
  for (const row of (invitationProjectRows ?? []) as { email: string; project_id: number }[]) {
    const list = invitationProjects.get(row.email)
    if (list) list.push(row.project_id)
    else invitationProjects.set(row.email, [row.project_id])
  }

  const projectsOf = (userId: string) =>
    members
      .filter((m) => m.user_id === userId)
      .flatMap((m) => {
        const project = allProjects.find((p) => p.id === m.project_id)
        return project ? [{ project, member: m }] : []
      })

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Administració</h1>

      <AdminTabs
        tabs={[
          {
            key: 'projectes',
            label: 'Projectes',
            content: (
              <ProjectsPanel
                projects={allProjects}
                ticketCounts={ticketCounts}
                memberCounts={memberCounts}
              />
            ),
          },
          {
            key: 'convidats',
            label: 'Convidats',
            content: (
              <InvitationsPanel
                invitations={(invitations ?? []) as Invitation[]}
                projects={allProjects}
                invitationProjects={invitationProjects}
              />
            ),
          },
          {
            key: 'comptes',
            label: 'Comptes',
            content: (
              <section className="card p-4">
                <h2 className="font-semibold">Comptes</h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  L’única casella global és <strong>Administrador</strong>: qui la té ho pot fer
                  tot a tots els projectes. La resta de permisos són de cada projecte i es donen
                  des de la seva administració.
                </p>

                <ul className="mt-3 divide-y divide-[var(--color-line)]">
                  {allProfiles.map((p) => {
                    const access = projectsOf(p.id)
                    return (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{displayName(p)}</p>
                          <p className="truncate text-xs text-[var(--color-muted)]">
                            {p.email} · des del {formatDate(p.created_at)}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                            {access.length === 0 ? (
                              'Sense accés a cap projecte'
                            ) : (
                              <>
                                Accés a:{' '}
                                {access.map(({ project, member }, i) => (
                                  <span key={project.id}>
                                    {i > 0 && ', '}
                                    <Link
                                      href={projectPath(project.slug, '/admin')}
                                      className="font-semibold text-[var(--color-brand)]"
                                    >
                                      {project.name}
                                    </Link>
                                    {member.is_manager
                                      ? ' (administra)'
                                      : member.can_edit_all
                                        ? ' (edita totes)'
                                        : member.can_create
                                          ? ' (crea fitxes)'
                                          : ''}
                                  </span>
                                ))}
                              </>
                            )}
                          </p>
                        </div>

                        {p.id === profile.id ? (
                          <span className="shrink-0 text-xs text-[var(--color-muted)]">
                            Ets tu
                          </span>
                        ) : (
                          <form
                            action={setUserAdmin}
                            className="flex shrink-0 items-center gap-3"
                          >
                            <input type="hidden" name="user_id" value={p.id} />
                            <label className="flex items-center gap-1.5 text-xs font-semibold">
                              <input
                                type="checkbox"
                                name="is_admin"
                                defaultChecked={p.is_admin}
                              />
                              Administrador
                            </label>
                            <SubmitButton className="btn btn-secondary" pendingLabel="…">
                              Aplicar
                            </SubmitButton>
                          </form>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ),
          },
        ]}
      />
    </div>
  )
}
