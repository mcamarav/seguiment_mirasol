import type { SupabaseClient } from '@supabase/supabase-js'

/** Filtres i ordenació de la llista de fitxes. Es comparteixen entre la llista
 * i la vista d'impressió, perquè el PDF surti exactament amb el mateix conjunt
 * de fitxes que s'està veient a pantalla. */

export type Tab = 'pendents' | 'resolts' | 'tots'

export const TABS: { key: Tab; label: string }[] = [
  { key: 'pendents', label: 'Pendents' },
  { key: 'resolts', label: 'Resolts' },
  { key: 'tots', label: 'Tots' },
]

export type SortKey =
  | 'updated_desc'
  | 'created_desc'
  | 'created_asc'
  | 'due_asc'
  | 'due_desc'
  | 'resolved_desc'
  | 'title_asc'

export const SORT_OPTIONS: { key: SortKey; label: string; column: string; ascending: boolean }[] = [
  { key: 'updated_desc', label: 'Modificació ↓', column: 'updated_at', ascending: false },
  { key: 'created_desc', label: 'Publicació ↓', column: 'created_at', ascending: false },
  { key: 'created_asc', label: 'Publicació ↑', column: 'created_at', ascending: true },
  { key: 'due_asc', label: 'Data prevista ↑', column: 'due_date', ascending: true },
  { key: 'due_desc', label: 'Data prevista ↓', column: 'due_date', ascending: false },
  { key: 'resolved_desc', label: 'Resolució ↓', column: 'resolved_at', ascending: false },
  { key: 'title_asc', label: 'Nom (A-Z)', column: 'title', ascending: true },
]

export interface TicketFilters {
  tab: Tab
  zona: string
  tipus: string
  assignat: string
  q: string
  ordre: SortKey
}

type SearchParams = Record<string, string | string[] | undefined>

export function parseTicketFilters(sp: SearchParams): TicketFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined))
  const estat = one('estat') as Tab | undefined

  return {
    tab: estat && TABS.some((t) => t.key === estat) ? estat : 'pendents',
    zona: one('zona') ?? '',
    tipus: one('tipus') ?? '',
    assignat: one('assignat') ?? '',
    q: (one('q') ?? '').trim(),
    ordre: (SORT_OPTIONS.find((s) => s.key === one('ordre'))?.key ?? 'updated_desc') as SortKey,
  }
}

/** Enllaç a `path` amb els paràmetres buits descartats. */
export function buildHref(params: Record<string, string | undefined>, path = '/'): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

export function hrefFor(filters: TicketFilters, path = '/'): string {
  return buildHref({ ...filters, estat: filters.tab }, path)
}

/** Consulta de `ticket_list` ja filtrada i ordenada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ticketListQuery(supabase: SupabaseClient<any>, f: TicketFilters) {
  const sort = SORT_OPTIONS.find((s) => s.key === f.ordre)!

  let query = supabase
    .from('ticket_list')
    .select('*')
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })

  if (f.tab === 'pendents') query = query.in('status', ['obert', 'solucio_acordada'])
  if (f.tab === 'resolts') query = query.eq('status', 'resolt')
  if (f.zona) query = query.eq('zone_id', Number(f.zona))
  if (f.tipus) query = query.eq('work_type_id', Number(f.tipus))
  if (f.assignat.startsWith('user:')) query = query.eq('assignee_id', f.assignat.slice(5))
  if (f.assignat.startsWith('team:')) query = query.eq('assignee_team_id', Number(f.assignat.slice(5)))
  if (f.q) {
    // PostgREST separa els filtres d'`or` per comes i parèntesis: cal netejar-los.
    const safe = f.q.replace(/[,()%*\\]/g, ' ').trim()
    if (safe) query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
  }

  return query
}

/** Descripció llegible dels filtres actius, per encapçalar el PDF. */
export function describeFilters(
  f: TicketFilters,
  zoneName: string | null,
  typeName: string | null,
  assigneeName: string | null,
): string {
  const parts = [TABS.find((t) => t.key === f.tab)!.label]
  if (zoneName) parts.push(`Zona: ${zoneName}`)
  if (typeName) parts.push(`Tipus: ${typeName}`)
  if (assigneeName) parts.push(`Assignat a: ${assigneeName}`)
  if (f.q) parts.push(`Cerca: «${f.q}»`)
  return parts.join(' · ')
}
