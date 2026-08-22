import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { canManageProject } from '@/lib/permissions'
import { loadProjectContext, loadProjectPeople } from '@/lib/project'
import { projectPath } from '@/lib/routes'
import { AdminTabs } from '@/components/AdminTabs'
import { CatalogEditor } from './CatalogEditor'
import { MembersPanel } from './MembersPanel'
import { TeamsEditor } from './TeamsEditor'
import { renameProject, seedCatalogs } from './actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { Profile, WorkType, Zone } from '@/lib/types'

export default async function ProjectAdminPage({
  params,
}: {
  params: Promise<{ projecte: string }>
}) {
  const { projecte } = await params
  const context = await loadProjectContext(projecte)
  if (!context) notFound()

  const { project, access, teams } = context

  if (!canManageProject(access)) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold">Administració del projecte</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Aquesta pantalla és per a qui administra aquest projecte.
        </p>
        <Link href={projectPath(project.slug)} className="btn btn-secondary mt-4">
          Tornar
        </Link>
      </div>
    )
  }

  const supabase = await createClient()
  const [{ data: zones }, { data: workTypes }, { data: allProfiles }, members] = await Promise.all([
    supabase.from('zones').select('*').eq('project_id', project.id).order('sort_order'),
    supabase.from('work_types').select('*').eq('project_id', project.id).order('sort_order'),
    supabase.from('profiles').select('id, email, full_name, is_admin, created_at').order('email'),
    loadProjectPeople(project.id),
  ])

  const memberIds = new Set(members.map((m) => m.profile.id))
  // L'RLS només deixa veure els perfils de la gent amb qui es comparteix algun
  // projecte (l'administrador de la instal·lació, tots): per això la llista de
  // candidats pot ser curta si no ets administrador.
  const candidates = ((allProfiles ?? []) as Profile[]).filter((p) => !memberIds.has(p.id))

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Administració · {project.name}</h1>

      <AdminTabs
        tabs={[
          {
            key: 'accessos',
            label: 'Qui té accés',
            content: (
              <MembersPanel slug={project.slug} members={members} candidates={candidates} />
            ),
          },
          {
            key: 'equips',
            label: 'Equips',
            content: (
              <TeamsEditor
                slug={project.slug}
                teams={teams}
                profiles={members.map((m) => m.profile)}
              />
            ),
          },
          {
            key: 'catalegs',
            label: 'Zones i tipus',
            content: (
              <div className="space-y-4">
                <div className="grid gap-5 sm:grid-cols-2">
                  <CatalogEditor
                    slug={project.slug}
                    table="zones"
                    title="Zones"
                    hint="Les estances i espais d’aquesta obra. Amagar-ne una no afecta les fitxes existents."
                    items={(zones ?? []) as Zone[]}
                  />
                  <CatalogEditor
                    slug={project.slug}
                    table="work_types"
                    title="Tipus"
                    hint="El tipus de treball: pintura, finestres, electricitat…"
                    items={(workTypes ?? []) as WorkType[]}
                  />
                </div>
                <form action={seedCatalogs} className="card p-4">
                  <input type="hidden" name="projecte" value={project.slug} />
                  <p className="text-xs text-[var(--color-muted)]">
                    Si aquest projecte s’ha quedat sense llistes, es poden tornar a sembrar les
                    zones i els tipus per defecte. No en toca ni n’esborra cap de les que ja hi ha.
                  </p>
                  <SubmitButton className="btn btn-secondary mt-3" pendingLabel="Sembrant…">
                    Sembrar les llistes per defecte
                  </SubmitButton>
                </form>
              </div>
            ),
          },
          {
            key: 'projecte',
            label: 'El projecte',
            content: (
              <section className="card p-4">
                <h2 className="font-semibold">Nom del projecte</h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  L’adreça (<code>/p/{project.slug}</code>) no canvia mai, perquè els enllaços
                  que la gent ja té guardats continuïn funcionant.
                </p>
                <form action={renameProject} className="mt-3 flex gap-2">
                  <input type="hidden" name="projecte" value={project.slug} />
                  <input name="name" defaultValue={project.name} required className="field" />
                  <SubmitButton className="btn btn-secondary shrink-0" pendingLabel="Desant…">
                    Desar
                  </SubmitButton>
                </form>
              </section>
            ),
          },
        ]}
      />
    </div>
  )
}
