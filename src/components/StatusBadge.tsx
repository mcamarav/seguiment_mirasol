import { STATUS_LABELS } from '@/lib/permissions'
import type { TicketStatus } from '@/lib/types'

const STYLES: Record<TicketStatus, string> = {
  obert: 'bg-amber-100 text-amber-900',
  solucio_acordada: 'bg-sky-100 text-sky-900',
  resolt: 'bg-emerald-100 text-emerald-900',
}

// A la llista la columna d'estat és estreta: hi cal una etiqueta d'una paraula.
const SHORT_LABELS: Record<TicketStatus, string> = {
  obert: 'Obert',
  solucio_acordada: 'Proposada',
  resolt: 'Resolt',
}

export function StatusBadge({ status, short = false }: { status: TicketStatus; short?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}
      title={short ? STATUS_LABELS[status] : undefined}
    >
      {short ? SHORT_LABELS[status] : STATUS_LABELS[status]}
    </span>
  )
}
