import Link from 'next/link'
import Form from 'next/form'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { canCreateTickets, STATUS_LABELS } from '@/lib/permissions'
import { toTeamsWithMembers } from '@/lib/teams'
import { displayName } from '@/lib/format'
import { TicketList } from './TicketList'
import { FilterMultiSelect } from './FilterMultiSelect'
import {
  buildHref,
  hrefFor,
  parseTicketFilters,
  SORT_OPTIONS,
  TABS,
  ticketListQuery,
} from './ticket-filters'
import type { Profile, TicketListRow, WorkType, Zone } from '@/lib/types'

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseTicketFilters(await searchParams)
  const { tab, zona, tipus, assignat, q, ordre } = filters

  const profile = await getCurrentProfile()
  const supabase = await createClient()

  const [{ data: tickets, error }, { data: zones }, { data: workTypes }, { data: profiles }, { data: teamRows }] =
    await Promise.all([
      ticketListQuery(supabase, filters),
      supabase.from('zones').select('*').order('sort_order'),
      supabase.from('work_types').select('*').order('sort_order'),
      supabase.from('profiles').select('id, email, full_name, is_admin, can_create, can_edit_all, created_at'),
      supabase.from('teams').select('id, name, global_role, created_at, team_members(user_id)'),
    ])
  const assignees = (profiles ?? []) as Profile[]
  const teams = toTeamsWithMembers(teamRows ?? [])

  const rows = (tickets ?? []) as TicketListRow[]

  const counts = { obert: 0, solucio_acordada: 0, resolt: 0 }
  for (const r of rows) counts[r.status] += 1

  const hasFilters =
    zona.length > 0 || tipus.length > 0 || assignat.length > 0 || q !== '' || ordre !== 'updated_desc'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-xl font-bold tracking-tight">Fitxes</h1>
        {rows.length > 0 && (
          <Link
            href={hrefFor(filters, '/tickets/imprimir')}
            className="text-sm font-semibold text-[var(--color-muted)]"
          >
            Exportar PDF
          </Link>
        )}
        {profile && canCreateTickets(profile) && (
          <Link href="/tickets/nova" className="btn btn-primary">
            + Nova fitxa
          </Link>
        )}
      </div>

      <nav className="flex gap-1.5 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={buildHref({ estat: key, zona, tipus, assignat, q, ordre })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap ${
              tab === key
                ? 'bg-[var(--color-brand)] text-white'
                : 'card text-[var(--color-muted)]'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <Form action="/" className="card space-y-3 p-3">
        <input type="hidden" name="estat" value={tab} />

        <div className="grid items-start gap-3 sm:grid-cols-3">
          <FilterMultiSelect
            name="zona"
            label="Zones"
            selected={zona}
            options={((zones ?? []) as Zone[]).map((z) => ({
              value: String(z.id),
              label: z.name,
            }))}
          />
          <FilterMultiSelect
            name="tipus"
            label="Tipus"
            selected={tipus}
            options={((workTypes ?? []) as WorkType[]).map((t) => ({
              value: String(t.id),
              label: t.name,
            }))}
          />
          <FilterMultiSelect
            name="assignat"
            label="Assignat a"
            selected={assignat}
            options={[
              ...teams.map((t) => ({
                value: `team:${t.id}`,
                label: t.name,
                group: 'Equips',
              })),
              ...assignees.map((p) => ({
                value: `user:${p.id}`,
                label: displayName(p),
                group: 'Persones',
              })),
            ]}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
          <input
            name="q"
            defaultValue={q}
            className="field"
            placeholder="Cercar per nom o descripció…"
            aria-label="Cercar"
          />
          <select
            name="ordre"
            defaultValue={ordre}
            className="field truncate"
            aria-label="Ordenar per"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filtrar
          </button>
          {hasFilters && (
            <Link
              href={buildHref({ estat: tab })}
              className="px-2 text-center text-sm font-semibold text-[var(--color-muted)]"
            >
              Netejar
            </Link>
          )}
        </div>
      </Form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          No s’han pogut carregar les fitxes: {error.message}
        </p>
      )}

      <p className="text-sm text-[var(--color-muted)]">
        {rows.length} {rows.length === 1 ? 'fitxa' : 'fitxes'}
        {tab !== 'resolts' && (
          <>
            {' · '}
            {counts.obert} {STATUS_LABELS.obert.toLowerCase()}
            {' · '}
            {counts.solucio_acordada} amb solució proposada
          </>
        )}
      </p>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
          Cap fitxa amb aquests filtres.
        </div>
      ) : (
        <TicketList rows={rows} />
      )}
    </div>
  )
}
