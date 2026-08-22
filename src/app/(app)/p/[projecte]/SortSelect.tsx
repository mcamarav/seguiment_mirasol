'use client'

import { SORT_OPTIONS, type SortKey } from './ticket-filters'

/** Ordenació de la llista. No és un filtre, així que viu al costat del recompte
 * i no dins del panell de filtres: s'aplica tota sola en triar una opció, sense
 * haver de passar pel botó «Filtrar».
 *
 * `form` l'associa al formulari de filtres encara que estigui a fora, de manera
 * que en enviar-lo els filtres marcats hi viatgen igualment. */
export function SortSelect({ form, value }: { form: string; value: SortKey }) {
  return (
    <select
      // Sense estat de React: el desplegable es queda amb el que ha triat
      // l'usuari mentre es carrega la pàgina nova. La `key` el torna a muntar
      // quan el valor ve de fora (per exemple amb el botó «enrere»).
      key={value}
      form={form}
      name="ordre"
      defaultValue={value}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      aria-label="Ordenar per"
      className="max-w-[55%] shrink-0 truncate rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-sm"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
