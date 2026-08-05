'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setApproval } from '../actions'
import { ACTORS, ACTOR_LABELS } from '@/lib/permissions'
import { formatDateTime } from '@/lib/format'
import { useGlobalPending } from '@/components/PendingOverlay'
import type { Actor } from '@/lib/types'

export function ApprovalPanel({
  ticketId,
  canApprove,
  approvals,
  approvedBy,
}: {
  ticketId: number
  canApprove: Record<Actor, boolean>
  approvals: Record<Actor, string | null>
  approvedBy: Record<Actor, string | null>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Actor | null>(null)
  useGlobalPending(pending)

  function toggle(actor: Actor, approve: boolean) {
    setError(null)
    setBusy(actor)
    startTransition(async () => {
      const result = await setApproval(ticketId, actor, approve)
      setBusy(null)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const done = ACTORS.filter((a) => approvals[a]).length

  return (
    <section className="card p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="mr-auto font-semibold">Aprovacions</h2>
        <span className="text-sm text-[var(--color-muted)]">{done} de 3</span>
      </div>

      <p className="mt-1 text-xs text-[var(--color-muted)]">
        La fitxa queda <strong>resolta</strong> automàticament quan els tres actors han aprovat.
      </p>

      <ul className="mt-3 divide-y divide-[var(--color-line)]">
        {ACTORS.map((actor) => {
          const at = approvals[actor]
          const allowed = canApprove[actor]
          return (
            <li key={actor} className="flex items-center gap-3 py-2.5">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  at
                    ? 'bg-emerald-600 text-white'
                    : 'border border-dashed border-[var(--color-line)] text-[var(--color-muted)]'
                }`}
                aria-hidden
              >
                {at ? '✓' : ''}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{ACTOR_LABELS[actor]}</p>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {at ? `${approvedBy[actor] ?? '—'} · ${formatDateTime(at)}` : 'Pendent'}
                </p>
              </div>
              {allowed && (
                <button
                  type="button"
                  onClick={() => toggle(actor, !at)}
                  disabled={pending && busy === actor}
                  className={`btn ${at ? 'btn-secondary' : 'btn-primary'} shrink-0`}
                >
                  {busy === actor ? '…' : at ? 'Retirar' : 'Aprovar'}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </section>
  )
}
