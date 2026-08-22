'use client'

import { useState } from 'react'

export interface AdminTab {
  key: string
  label: string
  content: React.ReactNode
}

/** Pestanyes purament client-side: totes les seccions ja arriben renderitzades
 * des del servidor, així que canviar de pestanya no torna a demanar dades. */
export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const [active, setActive] = useState<string>(tabs[0]?.key ?? '')
  const current = tabs.find((t) => t.key === active) ?? tabs[0]

  return (
    <div>
      <nav className="flex gap-1.5 overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap ${
              current?.key === key
                ? 'bg-[var(--color-brand)] text-white'
                : 'card text-[var(--color-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-4 space-y-5">{current?.content}</div>
    </div>
  )
}
