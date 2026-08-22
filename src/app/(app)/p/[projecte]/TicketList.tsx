import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { ApprovalPips } from '@/components/ApprovalPips'
import { formatDateShort, ticketRef, truncate } from '@/lib/format'
import { projectPath } from '@/lib/routes'
import type { TicketListRow } from '@/lib/types'

// Mateixes columnes a la capçalera i a cada fila. A partir de `md` és una taula
// de 5 columnes; per sota es reordena en 3 línies (vegeu els `order-*`), perquè
// en un mòbil no hi cabria una taula sense scroll horitzontal.
//
// Les dues columnes de text van en `fr` (i amb minmax(0,…), perquè un títol
// llarg no les faci créixer): així el títol sempre s'endú la part grossa de
// l'espai, en lloc de quedar-se amb el que sobra de les columnes fixes.
const COLUMNS = 'md:grid-cols-[5.5rem_minmax(0,2.2fr)_minmax(0,1.1fr)_7.5rem_10rem]'

function isOverdue(t: TicketListRow): boolean {
  if (!t.due_date || t.status === 'resolt') return false
  return t.due_date < new Date().toISOString().slice(0, 10)
}

function assigneeLabel(t: TicketListRow): string | null {
  if (t.assignee_team_name) return `Equip ${t.assignee_team_name}`
  return t.assignee_name || t.assignee_email || null
}

export function TicketList({ slug, rows }: { slug: string; rows: TicketListRow[] }) {
  return (
    <div className="card overflow-hidden">
      <div
        className={`hidden border-b border-[var(--color-line)] px-4 py-2 text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase md:grid md:gap-3 ${COLUMNS}`}
      >
        <span>ID / Ubicació</span>
        <span>Tasca i detalls</span>
        <span>Assignat</span>
        <span>Venciment</span>
        <span>Estat</span>
      </div>

      <ul className="divide-y divide-[var(--color-line)]">
        {rows.map((t) => {
          const overdue = isOverdue(t)
          const assignee = assigneeLabel(t)
          return (
            <li key={t.id}>
              <Link
                href={projectPath(slug, `/tickets/${t.ref}`)}
                className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-[var(--color-brand-soft)] md:items-start md:gap-3 ${COLUMNS}`}
              >
                <div className="order-1 min-w-0 text-xs text-[var(--color-muted)] md:order-none">
                  <span className="font-mono font-semibold text-[var(--color-ink)]">
                    {ticketRef(t.ref)}
                  </span>
                  <span className="block truncate">{t.zone_name ?? 'Sense zona'}</span>
                </div>

                <div className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
                  <p className="font-semibold">{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
                    <span>{t.work_type_name ?? 'Sense tipus'}</span>
                    <span aria-hidden>·</span>
                    <span>💬 {t.comment_count}</span>
                    <ApprovalPips
                      approvals={{
                        responsable: t.approved_responsable_at,
                        tecnics: t.approved_tecnics_at,
                        propietari: t.approved_propietari_at,
                      }}
                      reviews={{
                        tecnics: t.review_tecnics_at,
                        propietari: t.review_propietari_at,
                      }}
                    />
                  </p>
                  {t.description && (
                    <p className="mt-1 hidden line-clamp-2 text-xs text-[var(--color-muted)] lg:block">
                      {truncate(t.description, 120)}
                    </p>
                  )}
                </div>

                <div className="order-4 min-w-0 truncate text-xs text-[var(--color-muted)] md:order-none md:text-sm">
                  {assignee ?? 'Sense assignar'}
                </div>

                <div
                  className={`order-5 justify-self-end text-xs whitespace-nowrap md:order-none md:justify-self-start ${
                    overdue ? 'font-semibold text-red-700' : 'text-[var(--color-muted)]'
                  }`}
                >
                  {t.due_date ? `📅 ${formatDateShort(t.due_date)}` : '⏳ Sense data'}
                </div>

                <div className="order-2 justify-self-end md:order-none md:justify-self-start">
                  <StatusBadge ticket={t} />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
