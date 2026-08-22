import Link from 'next/link'
import { notFound } from 'next/navigation'
import { canManageProject } from '@/lib/permissions'
import { loadProjectContext } from '@/lib/project'
import { projectPath } from '@/lib/routes'

/** Tot el que hi ha sota /p/[projecte] ja té el projecte comprovat: si no
 * existeix o l'usuari no hi té accés, aquí es queda (notFound, sense dir si
 * existeix o no). Les pantalles de dins tornen a carregar el context — no es
 * poden fiar del layout per als permisos, però sí que se'l troben validat. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projecte: string }>
}) {
  const { projecte } = await params
  const context = await loadProjectContext(projecte)
  if (!context) notFound()

  const { project, access } = context

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={projectPath(project.slug)} className="text-lg font-bold tracking-tight">
          {project.name}
        </Link>
        {!project.active && (
          <span className="text-xs text-[var(--color-muted)]">(projecte amagat)</span>
        )}
        {canManageProject(access) && (
          <Link
            href={projectPath(project.slug, '/admin')}
            className="text-sm font-semibold text-[var(--color-brand)]"
          >
            Administrar
          </Link>
        )}
        <Link href="/" className="text-sm font-semibold text-[var(--color-muted)]">
          Canviar de projecte
        </Link>
      </div>

      {children}
    </div>
  )
}
