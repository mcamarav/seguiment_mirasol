import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { displayName, formatDate } from '@/lib/format'
import { describeFilters, hrefFor, parseTicketFilters, ticketListQuery } from '../../ticket-filters'
import { PrintButton } from './PrintButton'
import { PrintTicket } from './PrintTicket'
import './print.css'
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

  const zoneNames = filters.zona.flatMap(
    (id) => (zones as Zone[] | null)?.filter((z) => String(z.id) === id).map((z) => z.name) ?? [],
  )
  const typeNames = filters.tipus.flatMap(
    (id) =>
      (workTypes as WorkType[] | null)?.filter((w) => String(w.id) === id).map((w) => w.name) ?? [],
  )
  const teamList = (teamRows ?? []) as { id: number; name: string }[]
  const people = (profiles ?? []) as Profile[]
  const assigneeNames = filters.assignat.flatMap((value) => {
    if (value.startsWith('team:')) {
      const team = teamList.find((t) => String(t.id) === value.slice(5))
      return team ? [`Equip ${team.name}`] : []
    }
    if (value.startsWith('user:')) {
      const person = people.find((p) => p.id === value.slice(5))
      return person ? [displayName(person)] : []
    }
    return []
  })

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href={hrefFor(filters)} className="mr-auto text-sm font-semibold text-[var(--color-muted)]">
          ← Tornar a la llista
        </Link>
        <PrintButton />
      </div>

      <p className="no-print text-xs text-[var(--color-muted)]">
        Al diàleg d’impressió, tria «Desa com a PDF», mida A4 i marges «per defecte». Cada fitxa
        s’imprimeix sencera, sense partir-se entre pàgines.
      </p>

      <div className="print-sheet">
        <header className="print-doc-head">
          <h1 className="print-doc-title">Seguiment Mirasol · Fitxes</h1>
          <p className="print-doc-meta">
            {describeFilters(filters, zoneNames, typeNames, assigneeNames)}
          </p>
          <p className="print-doc-count">
            {rows.length} {rows.length === 1 ? 'fitxa' : 'fitxes'} · generat el{' '}
            {formatDate(new Date().toISOString())}
          </p>
        </header>

        {rows.length === 0 ? (
          <p>Cap fitxa amb aquests filtres.</p>
        ) : (
          rows.map((t) => (
            <PrintTicket
              key={t.id}
              ticket={t}
              descriptionImages={imagesFor(t.id, 'description')}
              solutionImages={imagesFor(t.id, 'agreed_solution')}
            />
          ))
        )}
      </div>
    </div>
  )
}
