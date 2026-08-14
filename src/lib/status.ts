/** Estat detallat d'una fitxa.
 *
 * A la base de dades `tickets.status` només té tres valors (obert /
 * solucio_acordada / resolt), que és el que cal per als filtres i els índexs.
 * Per a la persona que mira la fitxa, però, el que importa és en quin punt del
 * circuit d'aprovacions està, i això surt de combinar les tres caselles:
 *
 *   responsable ✓ tècnic ✓ propietari ✓  → Resolt
 *   responsable ✓ tècnic ✓               → Pendent aprovació propietari
 *   responsable ✓             propietari ✓ → Pendent aprovació tècnic
 *   responsable ✓                        → Executat
 *   sense responsable, amb solució       → Pendent · Solució proposada
 *   sense responsable, sense solució     → Pendent
 *
 * L'aprovació del responsable és la que diu que la feina s'ha fet: mentre no
 * hi és, la fitxa és pendent encara que el tècnic o el propietari ja hagin
 * marcat la seva casella (poden aprovar en qualsevol ordre).
 */

export type TicketStage =
  | 'pendent'
  | 'pendent_solucio'
  | 'executat'
  | 'pendent_tecnic'
  | 'pendent_propietari'
  | 'resolt'

/** Els camps de la fitxa d'on surt l'estat; els tenen tant `Ticket` com
 * `TicketListRow`, així que totes dues es poden passar tal qual. */
export interface StageSource {
  agreed_solution: string | null
  approved_responsable_at: string | null
  approved_tecnics_at: string | null
  approved_propietari_at: string | null
}

export function stageOf(t: StageSource): TicketStage {
  const responsable = Boolean(t.approved_responsable_at)
  const tecnics = Boolean(t.approved_tecnics_at)
  const propietari = Boolean(t.approved_propietari_at)

  if (!responsable) {
    return t.agreed_solution && t.agreed_solution.trim() !== '' ? 'pendent_solucio' : 'pendent'
  }
  if (tecnics && propietari) return 'resolt'
  if (tecnics) return 'pendent_propietari'
  if (propietari) return 'pendent_tecnic'
  return 'executat'
}

export const STAGE_LABELS: Record<TicketStage, string> = {
  pendent: 'Pendent',
  pendent_solucio: 'Pendent · Solució proposada',
  executat: 'Executat',
  pendent_tecnic: 'Pendent aprovació tècnic',
  pendent_propietari: 'Pendent aprovació propietari',
  resolt: 'Resolt',
}

/** Per a la línia de recompte de la llista: «3 executades · 2 pendents…». */
export const STAGE_COUNT_LABELS: Record<TicketStage, string> = {
  pendent: 'pendents',
  pendent_solucio: 'amb solució proposada',
  executat: 'executades',
  pendent_tecnic: 'a falta del tècnic',
  pendent_propietari: 'a falta del propietari',
  resolt: 'resoltes',
}

/** Ordre del circuit, de més lluny a més a prop de resolt. */
export const STAGES: TicketStage[] = [
  'pendent',
  'pendent_solucio',
  'executat',
  'pendent_tecnic',
  'pendent_propietari',
  'resolt',
]
