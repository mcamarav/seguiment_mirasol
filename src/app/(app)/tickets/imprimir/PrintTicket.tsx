import { ticketRef } from '@/lib/format'
import { STATUS_LABELS } from '@/lib/permissions'
import type { TicketListRow } from '@/lib/types'

/** Una fitxa a la vista d'impressió: marc sòlid, capçalera en banda negra i
 * dues columnes fixes (descripció / solució). Res depèn de l'amplada de la
 * finestra ni del color, perquè està pensat per a un A4 imprès. */
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
    : t.assignee_name || t.assignee_email || 'Sense assignar'

  return (
    <div className="print-ticket">
      <div className="print-ticket-head">
        <span className="print-ticket-ref">{ticketRef(t.id)}</span>
        <h2 className="print-ticket-title">{t.title}</h2>
        <span className="print-status">{STATUS_LABELS[t.status]}</span>
      </div>

      <div className="print-meta">
        <div>
          <span className="print-label">Zona</span>
          {t.zone_name ?? '—'}
        </div>
        <div>
          <span className="print-label">Tipus</span>
          {t.work_type_name ?? '—'}
        </div>
        <div>
          <span className="print-label">Assignat a</span>
          {assignedTo}
        </div>
      </div>

      <dl className="print-body">
        <div>
          <dt className="print-label">Descripció</dt>
          <dd className="print-value">{t.description || '—'}</dd>
          <ImageStrip images={descriptionImages} alt="Imatge de la descripció" />
        </div>
        <div>
          <dt className="print-label">Solució proposada</dt>
          <dd className="print-value">{t.agreed_solution || 'Encara no n’hi ha'}</dd>
          <ImageStrip images={solutionImages} alt="Imatge de la solució proposada" />
        </div>
      </dl>
    </div>
  )
}

function ImageStrip({ images, alt }: { images: { url: string }[]; alt: string }) {
  if (images.length === 0) return null
  return (
    <ul className="print-images">
      {images.map((img) => (
        <li key={img.url}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={alt} />
        </li>
      ))}
    </ul>
  )
}
