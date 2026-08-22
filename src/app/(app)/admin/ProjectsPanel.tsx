import Link from 'next/link'
import { formatDate } from '@/lib/format'
import { projectPath } from '@/lib/routes'
import { deleteProject, setProjectActive } from '../project-actions'
import { NewProjectForm } from '../NewProjectForm'
import { SubmitButton } from '@/components/SubmitButton'
import type { Project } from '@/lib/types'

/** Els projectes de la instal·lació. Cada un neix amb les zones i els tipus per
 * defecte, i es reparteixen els accessos des de la seva pròpia administració. */
export function ProjectsPanel({
  projects,
  ticketCounts,
  memberCounts,
}: {
  projects: Project[]
  ticketCounts: Map<number, number>
  memberCounts: Map<number, number>
}) {
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Projectes</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Cada projecte té les seves fitxes, zones, tipus i equips, i la seva pròpia llista de qui
        hi té accés. L’adreça surt del nom i no canvia després: <code>/p/mirasol</code>. La foto
        de portada es posa a la{' '}
        <Link href="/" className="font-semibold text-[var(--color-brand)]">
          llista de projectes
        </Link>
        .
      </p>

      <div className="mt-3">
        <NewProjectForm />
      </div>

      <ul className="mt-4 divide-y divide-[var(--color-line)]">
        {projects.map((project) => {
          const tickets = ticketCounts.get(project.id) ?? 0
          const members = memberCounts.get(project.id) ?? 0
          return (
            <li key={project.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {project.name}
                  {!project.active && (
                    <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                      amagat
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  /p/{project.slug} · {tickets} {tickets === 1 ? 'fitxa' : 'fitxes'} · {members}{' '}
                  {members === 1 ? 'persona' : 'persones'} · des del {formatDate(project.created_at)}
                </p>
              </div>

              <Link
                href={projectPath(project.slug, '/admin')}
                className="shrink-0 text-xs font-semibold text-[var(--color-brand)]"
              >
                Accessos i llistes
              </Link>

              <form action={setProjectActive} className="shrink-0">
                <input type="hidden" name="id" value={project.id} />
                <input type="hidden" name="active" value={String(project.active)} />
                <SubmitButton
                  className="text-xs font-semibold text-[var(--color-muted)]"
                  pendingLabel="…"
                >
                  {project.active ? 'Amagar' : 'Recuperar'}
                </SubmitButton>
              </form>

              {/* Esborrar només té sentit per a un projecte buit: amb fitxes a
                  dins se les enduria totes, amb els seus comentaris i imatges. */}
              {tickets === 0 && (
                <form action={deleteProject} className="shrink-0">
                  <input type="hidden" name="id" value={project.id} />
                  <SubmitButton
                    className="text-xs font-semibold text-[var(--color-muted)] hover:text-red-700"
                    pendingLabel="…"
                  >
                    Esborrar
                  </SubmitButton>
                </form>
              )}
            </li>
          )
        })}
      </ul>

      {projects.length === 0 && (
        <p className="mt-3 text-sm text-[var(--color-muted)]">Encara no hi ha cap projecte.</p>
      )}
    </section>
  )
}
