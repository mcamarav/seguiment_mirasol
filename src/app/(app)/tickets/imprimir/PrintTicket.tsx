import { ticketRef } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import type { TicketListRow } from '@/lib/types'

/** Una fitxa a la vista d'impressió, amb el mateix contingut que la capçalera
 * de la fitxa a pantalla. `print-ticket` evita que es parteixi entre pàgines. */
export function PrintTicket({
  ticket: t,
  descriptionImages,
  solutionImages,
}: {
  ticket: TicketListRow
  descriptionImages: { url: string }[]
  solutionImages: { url: string }[]
}) {
  const assignedTo = t.assignee_team_name
    ? `Equip ${t.assignee_team_name}`
    : t.assignee_name || t.assignee_email || null

  return (
    <div className="print-ticket rounded-xl border border-[var(--color-line)] p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold text-[var(--color-muted)]">
            {ticketRef(t.id)}
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight">{t.title}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {t.zone_name ?? 'Sense zona'} · {t.work_type_name ?? 'Sense tipus'}
          </p>
          <p className="mt-1 text-sm">
            <span className="text-[var(--color-muted)]">Assignat a: </span>
            {assignedTo ?? <span className="text-[var(--color-muted)]">sense assignar</span>}
          </p>
        </div>
        <StatusBadge status={t.status} />
      </div>

      <dl className="mt-3 grid gap-3 border-t border-[var(--color-line)] pt-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="field-label">Descripció</dt>
          <dd className="whitespace-pre-wrap">
            {t.description || <span className="text-[var(--color-muted)]">—</span>}
          </dd>
          <ImageStrip images={descriptionImages} alt="Imatge de la descripció" />
        </div>
        <div>
          <dt className="field-label">Solució proposada</dt>
          <dd className="whitespace-pre-wrap">
            {t.agreed_solution || <span className="text-[var(--color-muted)]">Encara no n’hi ha</span>}
          </dd>
          <ImageStrip images={solutionImages} alt="Imatge de la solució proposada" />
        </div>
      </dl>
    </div>
  )
}

function ImageStrip({ images, alt }: { images: { url: string }[]; alt: string }) {
  if (images.length === 0) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {images.map((img) => (
        <li key={img.url}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.url}
            alt={alt}
            className="h-24 w-auto rounded-lg border border-[var(--color-line)] object-contain"
          />
        </li>
      ))}
    </ul>
  )
}
