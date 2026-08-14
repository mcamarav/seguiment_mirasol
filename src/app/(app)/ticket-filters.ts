import type { SupabaseClient } from '@supabase/supabase-js'

/** Filtres i ordenació de la llista de fitxes. Es comparteixen entre la llista
 * i la vista d'impressió, perquè el PDF surti exactament amb el mateix conjunt
 * de fitxes que s'està veient a pantalla.
 *
 * Zona, tipus i assignat accepten diversos valors (multiselect): la llista de
 * buida vol dir "tots", i si n'hi ha uns quants es filtra per qualsevol d'ells. */

export type Tab = 'pendents' | 'a_revisar' | 'resolts' | 'tots'

// Les pestanyes són excloents: una fitxa «A revisar» no surt a «Pendents»,
// perquè l'estat de la base de dades ja és un valor a part.
export const TABS: { key: Tab; label: string }[] = [
  { key: 'pendents', label: 'Pendents' },
  { key: 'a_revisar', label: 'A revisar' },
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
  zona: string[]
  tipus: string[]
  /** Valors "user:<uuid>" i/o "team:<id>". */
  assignat: string[]
  q: string
  ordre: SortKey
}

type SearchParams = Record<string, string | string[] | undefined>

export function parseTicketFilters(sp: SearchParams): TicketFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined))
  // El formulari envia els valors repetits (zona=69&zona=91), que és el que
  // emet un <select multiple> en un GET. També s'accepta la forma amb comes
  // (zona=69,91) per si la URL s'escriu o es comparteix a mà; cap dels valors
  // (ids numèrics i uuids) conté comes, així que es pot partir sense perill.
  const many = (k: string) => {
    const value = sp[k]
    if (value == null) return []
    return (Array.isArray(value) ? value : [value])
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean)
  }
  const estat = one('estat') as Tab | undefined

  return {
    tab: estat && TABS.some((t) => t.key === estat) ? estat : 'pendents',
    zona: many('zona'),
    tipus: many('tipus'),
    assignat: many('assignat'),
    q: (one('q') ?? '').trim(),
    ordre: (SORT_OPTIONS.find((s) => s.key === one('ordre'))?.key ?? 'updated_desc') as SortKey,
  }
}

/** Enllaç a `path` amb els paràmetres buits descartats. Els valors múltiples es
 * repeteixen com a paràmetre (zona=1&zona=2), tal com els envia el formulari. */
export function buildHref(
  params: Record<string, string | string[] | undefined>,
  path = '/',
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) if (item) search.append(key, item)
    } else if (value) {
      search.set(key, value)
    }
  }
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

export function hrefFor(f: TicketFilters, path = '/'): string {
  return buildHref(
    { estat: f.tab, zona: f.zona, tipus: f.tipus, assignat: f.assignat, q: f.q, ordre: f.ordre },
    path,
  )
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
  if (f.tab === 'a_revisar') query = query.eq('status', 'a_revisar')
  if (f.tab === 'resolts') query = query.eq('status', 'resolt')
  if (f.zona.length > 0) query = query.in('zone_id', f.zona.map(Number))
  if (f.tipus.length > 0) query = query.in('work_type_id', f.tipus.map(Number))

  // "Assignat a" barreja persones i equips, que són dues columnes diferents:
  // amb valors dels dos tipus cal un OR entre elles.
  const userIds = f.assignat.filter((a) => a.startsWith('user:')).map((a) => a.slice(5))
  const teamIds = f.assignat.filter((a) => a.startsWith('team:')).map((a) => a.slice(5))
  if (userIds.length > 0 && teamIds.length > 0) {
    query = query.or(
      `assignee_id.in.(${userIds.join(',')}),assignee_team_id.in.(${teamIds.join(',')})`,
    )
  } else if (userIds.length > 0) {
    query = query.in('assignee_id', userIds)
  } else if (teamIds.length > 0) {
    query = query.in('assignee_team_id', teamIds.map(Number))
  }

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
  zoneNames: string[],
  typeNames: string[],
  assigneeNames: string[],
): string {
  const parts = [TABS.find((t) => t.key === f.tab)!.label]
  if (zoneNames.length > 0) {
    parts.push(`${zoneNames.length === 1 ? 'Zona' : 'Zones'}: ${zoneNames.join(', ')}`)
  }
  if (typeNames.length > 0) parts.push(`Tipus: ${typeNames.join(', ')}`)
  if (assigneeNames.length > 0) parts.push(`Assignat a: ${assigneeNames.join(', ')}`)
  if (f.q) parts.push(`Cerca: «${f.q}»`)
  return parts.join(' · ')
}
