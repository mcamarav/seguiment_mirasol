import Link from 'next/link'
import Form from 'next/form'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { canCreateTickets, STATUS_LABELS } from '@/lib/permissions'
import { toTeamsWithMembers } from '@/lib/teams'
import { displayName, formatDate, ticketRef, truncate } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import { ApprovalPips } from '@/components/ApprovalPips'
import type { Profile, TicketListRow, Zone } from '@/lib/types'

type Tab = 'pendents' | 'resolts' | 'tots'

const TABS: { key: Tab; label: string }[] = [
  { key: 'pendents', label: 'Pendents' },
  { key: 'resolts', label: 'Resolts' },
  { key: 'tots', label: 'Tots' },
]

type SortKey =
  | 'updated_desc'
  | 'created_desc'
  | 'created_asc'
  | 'due_asc'
  | 'due_desc'
  | 'resolved_desc'
  | 'title_asc'

const SORT_OPTIONS: { key: SortKey; label: string; column: string; ascending: boolean }[] = [
  { key: 'updated_desc', label: 'Modificació ↓', column: 'updated_at', ascending: false },
  { key: 'created_desc', label: 'Publicació ↓', column: 'created_at', ascending: false },
  { key: 'created_asc', label: 'Publicació ↑', column: 'created_at', ascending: true },
  { key: 'due_asc', label: 'Data prevista ↑', column: 'due_date', ascending: true },
  { key: 'due_desc', label: 'Data prevista ↓', column: 'due_date', ascending: false },
  { key: 'resolved_desc', label: 'Resolució ↓', column: 'resolved_at', ascending: false },
  { key: 'title_asc', label: 'Nom (A-Z)', column: 'title', ascending: true },
]

function buildHref(params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  const qs = search.toString()
  return qs ? `/?${qs}` : '/'
}

function isOverdue(t: TicketListRow): boolean {
  if (!t.due_date || t.status === 'resolt') return false
  return t.due_date < new Date().toISOString().slice(0, 10)
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined))

  const tab: Tab = (['pendents', 'resolts', 'tots'] as Tab[]).includes(one('estat') as Tab)
    ? (one('estat') as Tab)
    : 'pendents'
  const zona = one('zona') ?? ''
  const tipus = one('tipus') ?? ''
  const assignat = one('assignat') ?? ''
  const q = (one('q') ?? '').trim()
  const ordre = (SORT_OPTIONS.find((s) => s.key === one('ordre'))?.key ?? 'updated_desc') as SortKey
  const sortOption = SORT_OPTIONS.find((s) => s.key === ordre)!

  const profile = await getCurrentProfile()
  const supabase = await createClient()

  let query = supabase
    .from('ticket_list')
    .select('*')
    .order(sortOption.column, { ascending: sortOption.ascending, nullsFirst: false })

  if (tab === 'pendents') query = query.in('status', ['obert', 'solucio_acordada'])
  if (tab === 'resolts') query = query.eq('status', 'resolt')
  if (zona) query = query.eq('zone_id', Number(zona))
  if (tipus) query = query.eq('work_type_id', Number(tipus))
  if (assignat.startsWith('user:')) query = query.eq('assignee_id', assignat.slice(5))
  if (assignat.startsWith('team:')) query = query.eq('assignee_team_id', Number(assignat.slice(5)))
  if (q) {
    // PostgREST separa els filtres d'`or` per comes i parèntesis: cal netejar-los.
    const safe = q.replace(/[,()%*\\]/g, ' ').trim()
    if (safe) query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
  }

  const [{ data: tickets, error }, { data: zones }, { data: workTypes }, { data: profiles }, { data: teamRows }] =
    await Promise.all([
      query,
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
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tickets/${t.id}`}
                className="card block p-4 transition-colors hover:border-[var(--color-brand)]"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                      <span className="font-mono font-semibold">{ticketRef(t.id)}</span>
                      <span className="truncate">
                        {t.zone_name ?? 'Sense zona'} · {t.work_type_name ?? 'Sense tipus'}
                      </span>
                    </div>
                    <h2 className="mt-1 font-semibold">{t.title}</h2>
                    {t.description && (
                      <p className="mt-1 text-sm text-[var(--color-muted)]">
                        {truncate(t.description, 140)}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted)]">
                      <ApprovalPips
                        approvals={{
                          responsable: t.approved_responsable_at,
                          tecnics: t.approved_tecnics_at,
                          propietari: t.approved_propietari_at,
                        }}
                      />
                      <span>
                        {t.comment_count} {t.comment_count === 1 ? 'comentari' : 'comentaris'}
                      </span>
                      {t.due_date && (
                        <span className={isOverdue(t) ? 'font-semibold text-red-700' : undefined}>
                          Venç: {formatDate(t.due_date)}
                        </span>
                      )}
                      {(t.assignee_name || t.assignee_email || t.assignee_team_name) && (
                        <span>
                          → {t.assignee_team_name ? `Equip ${t.assignee_team_name}` : t.assignee_name || t.assignee_email}
                        </span>
                      )}
                      <span className="ml-auto">{formatDate(t.updated_at)}</span>
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
