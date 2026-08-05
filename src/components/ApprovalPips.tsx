import { ACTOR_LABELS, ACTORS } from '@/lib/permissions'
import type { Actor } from '@/lib/types'

/** Resum compacte de les 3 aprovacions: R · T · P */
export function ApprovalPips({
  approvals,
}: {
  approvals: Record<Actor, string | null>
}) {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Aprovacions">
      {ACTORS.map((actor) => {
        const done = Boolean(approvals[actor])
        return (
          <span
            key={actor}
            title={`${ACTOR_LABELS[actor]}: ${done ? 'aprovat' : 'pendent'}`}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              done
                ? 'bg-emerald-600 text-white'
                : 'border border-dashed border-[var(--color-line)] text-[var(--color-muted)]'
            }`}
          >
            {ACTOR_LABELS[actor].charAt(0)}
          </span>
        )
      })}
    </span>
  )
}
