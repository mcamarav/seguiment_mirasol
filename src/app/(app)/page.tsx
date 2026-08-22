import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/permissions'
import { signProjectPhotos } from '@/lib/project'
import { projectPath } from '@/lib/routes'
import { NewProjectForm } from './NewProjectForm'
import { ProjectPhotoButton } from './ProjectPhotoButton'
import type { Project, ProjectMember } from '@/lib/types'

/** Comptadors per projecte, per no entrar a cegues. Es calculen amb els mateixos
 * criteris que les pestanyes de la llista de fitxes. */
type Counts = { total: number; pendents: number; resoltes: number }

/** Portada de recanvi per als projectes sense foto: les inicials del nom. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

export default async function ProjectesPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')

  const supabase = await createClient()
  const [{ data: projectRows }, { data: ticketRows }, { data: memberRows }] = await Promise.all([
    supabase.from('projects').select('id, slug, name, image_path, active, created_at').order('name'),
    // L'RLS ja limita les fitxes als projectes on l'usuari té accés.
    supabase.from('ticket_list').select('project_id, status, approved_responsable_at'),
    // Els meus permisos a cada projecte: aquí només serveixen per saber a quines
    // portades puc tocar la foto.
    supabase
      .from('project_members')
      .select('project_id, user_id, is_manager, can_create, can_edit_all, created_at')
      .eq('user_id', profile.id),
  ])

  const projects = (projectRows ?? []) as Project[]
  const visible = projects.filter((p) => p.active || isAdmin(profile))
  const photos = await signProjectPhotos(visible)

  const managed = new Set(
    ((memberRows ?? []) as ProjectMember[]).filter((m) => m.is_manager).map((m) => m.project_id),
  )
  const canManage = (project: Project) => isAdmin(profile) || managed.has(project.id)

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
            Administració
          </Link>
        )}
      </div>

      {isAdmin(profile) && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Projecte nou</summary>
          <p className="mt-1 mb-3 text-xs text-[var(--color-muted)]">
            Neix amb les zones i els tipus per defecte, i sense ningú a dins: els accessos es
            reparteixen des de la seva administració. L’adreça surt del nom i no canvia després.
          </p>
          <NewProjectForm />
        </details>
      )}

      {visible.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
          Encara no tens accés a cap projecte. Parla amb l’administrador.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((project) => {
            const c = counts.get(project.id) ?? { total: 0, pendents: 0, resoltes: 0 }
            const photo = photos.get(project.id)
            return (
              <li
                key={project.id}
                className="card relative overflow-hidden transition-colors hover:border-[var(--color-brand)]"
              >
                <Link href={projectPath(project.slug)} className="block">
                  <div className="aspect-[16/9] w-full bg-[var(--color-brand-soft)]">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl font-bold tracking-wide text-[var(--color-brand)]/60">
                        {initials(project.name)}
                      </div>
                    )}
                  </div>

                  <div className="p-4">
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
                  </div>
                </Link>

                {/* A sobre de la portada, no pas dins de l'enllaç: un botó dins
                    d'un <a> no és HTML vàlid. */}
                {canManage(project) && (
                  <ProjectPhotoButton
                    projectId={project.id}
                    hasPhoto={Boolean(project.image_path)}
                    className="absolute top-2 right-2"
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
