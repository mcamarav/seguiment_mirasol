import { STAGE_LABELS, stageOf, type StageSource, type TicketStage } from '@/lib/status'

// El color acompanya el circuit: ambre mentre és pendent, blau quan hi ha
// solució, violeta un cop executada, teal mentre falten aprovacions i verd
// quan ja està tancada.
const STYLES: Record<TicketStage, string> = {
  pendent: 'bg-amber-100 text-amber-900',
  pendent_solucio: 'bg-sky-100 text-sky-900',
  executat: 'bg-violet-100 text-violet-900',
  pendent_tecnic: 'bg-teal-100 text-teal-900',
  pendent_propietari: 'bg-teal-100 text-teal-900',
  resolt: 'bg-emerald-100 text-emerald-900',
}

/** L'estat s'escriu sencer arreu (llista, fitxa i PDF): a la columna estreta
 * de la llista es reparteix en dues línies en lloc d'escurçar-se. */
export function StatusBadge({ ticket }: { ticket: StageSource }) {
  const stage = stageOf(ticket)
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-xl px-2.5 py-1 text-xs font-semibold ${STYLES[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  )
}
