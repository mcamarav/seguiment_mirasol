import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { displayName, formatDate } from '@/lib/format'
import { describeFilters, hrefFor, parseTicketFilters, ticketListQuery } from '../../ticket-filters'
import { PrintButton } from './PrintButton'
import { PrintTicket } from './PrintTicket'
import type { Profile, TicketFieldImage, TicketListRow, WorkType, Zone } from '@/lib/types'

const SIGNED_URL_TTL = 60 * 60 // 1 hora

export default async function ImprimirPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')

  const filters = parseTicketFilters(await searchParams)
  const supabase = await createClient()

  const [{ data: tickets }, { data: zones }, { data: workTypes }, { data: profiles }, { data: teamRows }] =
    await Promise.all([
      ticketListQuery(supabase, filters),
      supabase.from('zones').select('*').order('sort_order'),
      supabase.from('work_types').select('*').order('sort_order'),
      supabase.from('profiles').select('id, email, full_name, is_admin, can_create, can_edit_all, created_at'),
      supabase.from('teams').select('id, name'),
    ])

  const rows = (tickets ?? []) as TicketListRow[]

  // Imatges de la descripció i de la solució de totes les fitxes, d'un sol cop.
  const images = new Map<number, { field: TicketFieldImage['field']; url: string }[]>()
  if (rows.length > 0) {
    const { data: fieldImages } = await supabase
      .from('ticket_field_images')
      .select('id, ticket_id, field, storage_path, created_at')
      .in(
        'ticket_id',
        rows.map((r) => r.id),
      )
      .order('created_at', { ascending: true })

    const all = (fieldImages ?? []) as TicketFieldImage[]
    if (all.length > 0) {
      const { data: signed } = await supabase.storage
        .from('ticket-images')
        .createSignedUrls(
          all.map((i) => i.storage_path),
          SIGNED_URL_TTL,
        )
      const urls = new Map<string, string>()
      for (const entry of signed ?? []) {
        if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
      }
      for (const img of all) {
        const url = urls.get(img.storage_path)
        if (!url) continue
        const list = images.get(img.ticket_id) ?? []
        list.push({ field: img.field, url })
        images.set(img.ticket_id, list)
      }
    }
  }

  const imagesFor = (ticketId: number, field: TicketFieldImage['field']) =>
    (images.get(ticketId) ?? []).filter((i) => i.field === field)

  const zoneName = (zones as Zone[] | null)?.find((z) => String(z.id) === filters.zona)?.name ?? null
  const typeName =
    (workTypes as WorkType[] | null)?.find((w) => String(w.id) === filters.tipus)?.name ?? null
  const assigneeName = filters.assignat.startsWith('team:')
    ? `Equip ${
        (teamRows as { id: number; name: string }[] | null)?.find(
          (t) => String(t.id) === filters.assignat.slice(5),
        )?.name ?? '—'
      }`
    : filters.assignat.startsWith('user:')
      ? displayName(
          ((profiles ?? []) as Profile[]).find((p) => p.id === filters.assignat.slice(5)) ?? null,
        )
      : null

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href={hrefFor(filters)} className="mr-auto text-sm font-semibold text-[var(--color-muted)]">
          ← Tornar a la llista
        </Link>
        <PrintButton />
      </div>

      <p className="no-print text-xs text-[var(--color-muted)]">
        Al diàleg d’impressió, tria «Desa com a PDF» com a destinació. Cada fitxa s’imprimeix
        sencera, sense partir-se entre pàgines.
      </p>

      <header className="border-b border-[var(--color-line)] pb-3">
        <h1 className="text-xl font-bold tracking-tight">Seguiment Mirasol · Fitxes</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {describeFilters(filters, zoneName, typeName, assigneeName)}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {rows.length} {rows.length === 1 ? 'fitxa' : 'fitxes'} · generat el{' '}
          {formatDate(new Date().toISOString())}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Cap fitxa amb aquests filtres.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((t) => (
            <li key={t.id}>
              <PrintTicket
                ticket={t}
                descriptionImages={imagesFor(t.id, 'description')}
                solutionImages={imagesFor(t.id, 'agreed_solution')}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
