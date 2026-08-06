import Link from 'next/link'
import Form from 'next/form'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { canCreateTickets, STATUS_LABELS } from '@/lib/permissions'
import { toTeamsWithMembers } from '@/lib/teams'
import { displayName } from '@/lib/format'
import { TicketList } from './TicketList'
import {
  buildHref,
  hrefFor,
  parseTicketFilters,
  SORT_OPTIONS,
  TABS,
  ticketListQuery,
} from './ticket-filters'
import type { Profile, TicketListRow, Zone } from '@/lib/types'

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

      <Form action="/" className="card grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <input type="hidden" name="estat" value={tab} />
        <select name="zona" defaultValue={zona} className="field truncate" aria-label="Zona">
          <option value="">Totes les zones</option>
          {(zones as Zone[] | null)?.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select name="tipus" defaultValue={tipus} className="field truncate" aria-label="Tipus">
          <option value="">Tots els tipus</option>
          {(workTypes as Zone[] | null)?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          name="assignat"
          defaultValue={assignat}
          className="field truncate"
          aria-label="Assignat a"
        >
          <option value="">Assignat a tothom</option>
          {teams.length > 0 && (
            <optgroup label="Equips">
              {teams.map((t) => (
                <option key={`team:${t.id}`} value={`team:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Persones">
            {assignees.map((p) => (
              <option key={`user:${p.id}`} value={`user:${p.id}`}>
                {displayName(p)}
              </option>
            ))}
          </optgroup>
        </select>
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
        <input
          name="q"
          defaultValue={q}
          className="field col-span-2 sm:col-span-3"
          placeholder="Cercar per nom o descripció…"
          aria-label="Cercar"
        />
        <button type="submit" className="btn btn-secondary">
          Filtrar
        </button>
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
