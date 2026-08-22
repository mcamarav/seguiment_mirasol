'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markReviewed, setApproval, setReview } from '../actions'
import { ACTORS, ACTOR_LABELS, isReviewActor } from '@/lib/permissions'
import { formatDateTime } from '@/lib/format'
import { useGlobalPending } from '@/components/PendingOverlay'
import type { Actor, ReviewActor } from '@/lib/types'

export function ApprovalPanel({
  ticketId,
  canApprove,
  approvals,
  approvedBy,
  reviews,
  reviewedBy,
}: {
  ticketId: number
  canApprove: Record<Actor, boolean>
  approvals: Record<Actor, string | null>
  approvedBy: Record<Actor, string | null>
  reviews: Record<ReviewActor, string | null>
  reviewedBy: Record<ReviewActor, string | null>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Actor | null>(null)
  useGlobalPending(pending)

  function run(actor: Actor, action: () => Promise<{ error?: string }>) {
    setError(null)
    setBusy(actor)
    startTransition(async () => {
      const result = await action()
      setBusy(null)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const done = ACTORS.filter((a) => approvals[a]).length
  const responsableOk = Boolean(approvals.responsable)
  const enRevisio = Boolean(reviews.tecnics) || Boolean(reviews.propietari)

  return (
    <section className="card p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="mr-auto font-semibold">Aprovacions</h2>
        <span className="text-sm text-[var(--color-muted)]">{done} de 3</span>
      </div>

      <p className="mt-1 text-xs text-[var(--color-muted)]">
        La fitxa queda <strong>resolta</strong> automàticament quan els tres actors han aprovat.
        {responsableOk && !enRevisio && (
          <> El tècnic i el propietari poden demanar <strong>revisió</strong> en lloc d’aprovar.</>
        )}
        {enRevisio && (
          <>
            {' '}Està <strong>a revisar</strong>: quan el responsable la torni a marcar com a
            revisada, el tècnic i el propietari hauran de tornar a aprovar.
          </>
        )}
      </p>

      <ul className="mt-3 divide-y divide-[var(--color-line)]">
        {ACTORS.map((actor) => {
          const at = approvals[actor]
          const review = isReviewActor(actor) ? reviews[actor] : null
          const allowed = canApprove[actor]
          const working = pending && busy === actor
          return (
            <li key={actor} className="flex items-center gap-3 py-2.5">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  at
                    ? 'bg-emerald-600 text-white'
                    : review
                      ? 'bg-rose-600 text-white'
                      : 'border border-dashed border-[var(--color-line)] text-[var(--color-muted)]'
                }`}
                aria-hidden
              >
                {at ? '✓' : review ? '!' : ''}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{ACTOR_LABELS[actor]}</p>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {at
                    ? `${approvedBy[actor] ?? '—'} · ${formatDateTime(at)}`
                    : review && isReviewActor(actor)
                      ? `Demana revisió · ${reviewedBy[actor] ?? '—'} · ${formatDateTime(review)}`
                      : 'Pendent'}
                </p>
              </div>

              {allowed && (
                <div className="flex shrink-0 gap-2">
                  {/* El responsable, quan la fitxa està a revisar, la torna a
                      marcar com a feta amb «Revisat». */}
                  {actor === 'responsable' && enRevisio && (
                    <button
                      type="button"
                      onClick={() => run(actor, () => markReviewed(ticketId))}
                      disabled={working}
                      className="btn btn-primary"
                    >
                      {working ? '…' : 'Revisat'}
                    </button>
                  )}

                  {isReviewActor(actor) && review && (
                    <button
                      type="button"
                      onClick={() => run(actor, () => setReview(ticketId, actor, false))}
                      disabled={working}
                      className="btn btn-secondary"
                    >
                      {working ? '…' : 'Desfer revisió'}
                    </button>
                  )}

                  {isReviewActor(actor) && !review && responsableOk && (
                    <button
                      type="button"
                      onClick={() => run(actor, () => setReview(ticketId, actor, true))}
                      disabled={working}
                      className="btn btn-secondary"
                    >
                      {working ? '…' : 'Revisar'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => run(actor, () => setApproval(ticketId, actor, !at))}
                    disabled={working}
                    className={`btn ${at ? 'btn-secondary' : 'btn-primary'}`}
                  >
                    {working ? '…' : at ? 'Retirar' : 'Aprovar'}
                  </button>
                </div>
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
