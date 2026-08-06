const dateTime = new Intl.DateTimeFormat('ca-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateOnly = new Intl.DateTimeFormat('ca-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return dateTime.format(new Date(iso))
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return dateOnly.format(new Date(iso))
}

/** Com formatDate però sense el "del" davant de l'any: "07 d’ag. 2026".
 * Es fa servir a la llista, on cada columna té l'amplada justa. */
export function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const parts = dateOnly.formatToParts(new Date(iso))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${value('day')} ${value('month')} ${value('year')}`
}

/** Referència humana de la fitxa: #007 */
export function ticketRef(id: number): string {
  return `#${String(id).padStart(3, '0')}`
}

export function displayName(profile: { full_name: string | null; email: string } | null): string {
  if (!profile) return 'Desconegut'
  return profile.full_name?.trim() || profile.email
}

export function truncate(text: string | null, max = 160): string {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}
