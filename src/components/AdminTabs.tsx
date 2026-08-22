'use client'

import { useState } from 'react'

const TABS = [
  { key: 'convidats', label: 'Convidats' },
  { key: 'usuaris', label: 'Usuaris i permisos' },
  { key: 'equips', label: 'Equips' },
  { key: 'catalegs', label: 'Zones i tipus' },
] as const

type TabKey = (typeof TABS)[number]['key']

/** Pestanyes purament client-side: totes les seccions ja arriben renderitzades
 * des del servidor, així que canviar de pestanya no torna a demanar dades. */
export function AdminTabs(props: Record<TabKey, React.ReactNode>) {
  const [active, setActive] = useState<TabKey>('convidats')

  return (
    <div>
      <nav className="flex gap-1.5 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap ${
              active === key
                ? 'bg-[var(--color-brand)] text-white'
                : 'card text-[var(--color-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-4 space-y-5">{props[active]}</div>
    </div>
  )
}
