'use client'

import { useState } from 'react'

export interface FilterOption {
  value: string
  label: string
  /** Encapçalament opcional per agrupar opcions (p. ex. Equips / Persones). */
  group?: string
}

/** Filtre de selecció múltiple: plegat mostra els valors triats separats per
 * comes, i desplegat una llista de checkboxes.
 *
 * Els checkboxes porten `name`/`value` de debò, així que el formulari GET els
 * envia igual que ho faria un <select multiple> (un paràmetre per valor triat).
 * L'estat només serveix per refrescar el resum del capçal en marcar-los. */
export function FilterMultiSelect({
  name,
  label,
  options,
  selected: initialSelected,
}: {
  name: string
  label: string
  options: FilterOption[]
  selected: string[]
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected)

  const toggle = (value: string) =>
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )

  // Es respecta l'ordre de les opcions, no el de clic, perquè el resum sigui estable.
  const chosen = options.filter((o) => selected.includes(o.value)).map((o) => o.label)

  // Encapçalaments de grup: es mostren en canviar de grup respecte l'opció anterior.
  let lastGroup: string | undefined

  return (
    <details className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="field-label">{label}</span>
          <span
            className={`block truncate text-sm ${chosen.length === 0 ? 'text-[var(--color-muted)]' : ''}`}
          >
            {chosen.length === 0 ? 'Tots' : chosen.join(', ')}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xs text-[var(--color-muted)]">
          ▾
        </span>
      </summary>

      <div className="max-h-56 overflow-y-auto border-t border-[var(--color-line)] p-2">
        {options.map((option) => {
          const heading = option.group && option.group !== lastGroup ? option.group : null
          lastGroup = option.group
          return (
            <div key={option.value}>
              {heading && <p className="field-label mt-1 px-1">{heading}</p>}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[var(--color-brand-soft)]">
                <input
                  type="checkbox"
                  name={name}
                  value={option.value}
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                <span className="min-w-0 truncate">{option.label}</span>
              </label>
            </div>
          )
        })}

        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="mt-2 px-1 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-brand)]"
          >
            Desmarcar-ho tot
          </button>
        )}
      </div>
    </details>
  )
}
