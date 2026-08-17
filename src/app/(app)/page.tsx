import Link from 'next/link'
import Form from 'next/form'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { canCreateTickets } from '@/lib/permissions'
import { STAGE_COUNT_LABELS, STAGES, stageOf, type TicketStage } from '@/lib/status'
import { toTeamsWithMembers } from '@/lib/teams'
import { displayName } from '@/lib/format'
import { TicketList } from './TicketList'
import { FilterMultiSelect } from './FilterMultiSelect'
import { SortSelect } from './SortSelect'
import {
  buildHref,
  ESTATS,
  hrefFor,
  parseTicketFilters,
  TOTS_ELS_ESTATS,
  ticketListQuery,
} from './ticket-filters'
import type { Profile, TicketListRow, WorkType, Zone } from '@/lib/types'

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseTicketFilters(await searchParams)
  const { estats, zona, tipus, assignat, q, ordre } = filters

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

  // Recompte per estat detallat: només es mostren els estats que hi són.
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<TicketStage, number>
  for (const r of rows) counts[stageOf(r)] += 1
  const breakdown = STAGES.filter((s) => counts[s] > 0).map(
    (s) => `${counts[s]} ${STAGE_COUNT_LABELS[s]}`,
  )

  const hasFilters =
    zona.length > 0 || tipus.length > 0 || assignat.length > 0 || q !== '' || ordre !== 'updated_desc'

  // Valors marcats als tres selectors: decideix si el bloc surt desplegat en
  // mòbil i quants n'anuncia el capçal quan està plegat.
  const seleccionats = zona.length + tipus.length + assignat.length

  const totsMarcats = estats.length === TOTS_ELS_ESTATS.length
  // Els estats es marquen i es desmarquen un a un; desmarcar l'últim que
  // queda equival a «Tots», que és més útil que quedar-se sense cap fitxa.
  const chipClass = (actiu: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap ${
      actiu ? 'bg-[var(--color-brand)] text-white' : 'card text-[var(--color-muted)]'
    }`

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
        {ESTATS.map(({ key, label }) => {
          const actiu = !totsMarcats && estats.includes(key)
          const seguent = actiu
            ? estats.filter((e) => e !== key)
            : TOTS_ELS_ESTATS.filter((e) => e === key || (!totsMarcats && estats.includes(e)))
          return (
            <Link
              key={key}
              href={buildHref({
                estat: seguent.length > 0 ? seguent : TOTS_ELS_ESTATS,
                zona,
                tipus,
                assignat,
                q,
                ordre,
              })}
              aria-pressed={actiu}
              className={chipClass(actiu)}
            >
              {label}
            </Link>
          )
        })}
        <Link
          href={buildHref({ estat: TOTS_ELS_ESTATS, zona, tipus, assignat, q, ordre })}
          aria-pressed={totsMarcats}
          className={chipClass(totsMarcats)}
        >
          Tots
        </Link>
      </nav>

      <Form action="/" id="filtres" className="card space-y-3 p-3">
        {estats.map((e) => (
          <input key={e} type="hidden" name="estat" value={e} />
        ))}

        {/* En mòbil els filtres s'emportaven mitja pantalla abans de la llista.
            Es pleguen sencers —selectors, cerca i botó— darrere aquest
            interruptor, que és només CSS: sense JS ni estat de React. A partir
            de `sm` es veuen sempre. Comencen desplegats si ja hi ha res marcat,
            per veure de seguida què s'està filtrant. */}
        <input
          type="checkbox"
          id="mostrar-filtres"
          defaultChecked={seleccionats > 0}
          className="peer sr-only sm:hidden"
        />
        <label
          htmlFor="mostrar-filtres"
          className="flex cursor-pointer items-center gap-1.5 py-1 text-sm font-semibold text-[var(--color-muted)] select-none peer-checked:[&_span:last-child]:rotate-180 sm:hidden"
        >
          Filtres
          {seleccionats > 0 && (
            <span className="rounded-full bg-[var(--color-brand-soft)] px-2 py-0.5 text-xs text-[var(--color-brand)]">
              {seleccionats}
            </span>
          )}
          {/* El botó ocupa tota l'amplada de la targeta perquè es vegi que és
              la capçalera del panell i sigui fàcil de prémer amb el dit. */}
          <span aria-hidden className="ml-auto text-xs transition-transform">
            ▾
          </span>
        </label>

        <div className="hidden space-y-3 peer-checked:block sm:block">
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

          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <input
              name="q"
              defaultValue={q}
              className="field"
              placeholder="Cercar per nom o descripció…"
              aria-label="Cercar"
            />
            <button type="submit" className="btn btn-secondary">
              Filtrar
            </button>
            {hasFilters && (
              <Link
                href={buildHref({ estat: estats })}
                className="px-2 text-center text-sm font-semibold text-[var(--color-muted)]"
              >
                Netejar
              </Link>
            )}
          </div>
        </div>
      </Form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          No s’han pogut carregar les fitxes: {error.message}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-[var(--color-muted)]">
          {rows.length} {rows.length === 1 ? 'fitxa' : 'fitxes'}
          {/* Amb un sol estat present el desglossament només repetiria el total. */}
          {breakdown.length > 1 && ` · ${breakdown.join(' · ')}`}
        </p>
        <SortSelect form="filtres" value={ordre} />
      </div>

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
