import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { approvalsFor, canCommentTicket, canEditTicket, isAdmin } from '@/lib/permissions'
import { buildTeamContext, toTeamsWithMembers } from '@/lib/teams'
import { displayName, formatDate, formatDateTime, ticketRef } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import { TicketForm } from '../TicketForm'
import { ApprovalPanel } from './ApprovalPanel'
import { CommentForm } from './CommentForm'
import { FieldImages } from './FieldImages'
import { deleteComment, deleteTicket } from '../actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { Comment, Profile, Ticket, TicketFieldImage, WorkType, Zone } from '@/lib/types'

const SIGNED_URL_TTL = 60 * 60 // 1 hora

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id)) notFound()

  const profile = await getCurrentProfile()
  if (!profile) redirect('/entrar')

  const supabase = await createClient()

  const [
    { data: ticket },
    { data: comments },
    { data: profiles },
    { data: zones },
    { data: workTypes },
    { data: fieldImages },
    { data: teamRows },
  ] = await Promise.all([
    supabase.from('tickets').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('comments')
      .select('id, ticket_id, author_id, body, created_at, comment_images(id, comment_id, storage_path, created_at)')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('id, email, full_name, is_admin, can_create, can_edit_all, created_at'),
    supabase.from('zones').select('*').order('sort_order'),
    supabase.from('work_types').select('*').order('sort_order'),
    supabase
      .from('ticket_field_images')
      .select('id, ticket_id, field, storage_path, created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    supabase.from('teams').select('id, name, global_role, created_at, team_members(user_id)'),
  ])

  if (!ticket) notFound()

  const t = ticket as Ticket
  const allComments = (comments ?? []) as Comment[]
  const people = new Map<string, Profile>(
    ((profiles ?? []) as Profile[]).map((p) => [p.id, p]),
  )
  const zoneList = (zones ?? []) as Zone[]
  const typeList = (workTypes ?? []) as WorkType[]
  const teams = toTeamsWithMembers(teamRows ?? [])
  const teamName = (teamId: number | null) => teams.find((tm) => tm.id === teamId)?.name ?? null
  const ctx = buildTeamContext(teams, profile.id)
  const allFieldImages = (fieldImages ?? []) as TicketFieldImage[]
  const canEdit = canEditTicket(profile, t)
  const canComment = canCommentTicket(profile, t, ctx)
  const approvals = approvalsFor(profile, t, ctx)

  // Signed URLs per a totes les imatges d'un sol cop (el bucket és privat).
  const allPaths = [
    ...allComments.flatMap((c) => c.comment_images.map((i) => i.storage_path)),
    ...allFieldImages.map((i) => i.storage_path),
  ]
  const signed = new Map<string, string>()
  if (allPaths.length > 0) {
    const { data } = await supabase.storage
      .from('ticket-images')
      .createSignedUrls(allPaths, SIGNED_URL_TTL)
    for (const entry of data ?? []) {
      if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl)
    }
  }

  const imagesFor = (field: TicketFieldImage['field']) =>
    allFieldImages
      .filter((i) => i.field === field)
      .flatMap((i) => {
        const url = signed.get(i.storage_path)
        return url ? [{ id: i.id, url }] : []
      })

  const zoneName = zoneList.find((z) => z.id === t.zone_id)?.name ?? 'Sense zona'
  const typeName = typeList.find((w) => w.id === t.work_type_id)?.name ?? 'Sense tipus'
  const nameOf = (uid: string | null) => (uid ? displayName(people.get(uid) ?? null) : null)
  const assignedTo = nameOf(t.assignee_id) ?? (t.assignee_team_id ? `Equip ${teamName(t.assignee_team_id)}` : null)

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-block text-sm font-semibold text-[var(--color-muted)]">
        ← Totes les fitxes
      </Link>

      <header className="card p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-semibold text-[var(--color-muted)]">
              {ticketRef(t.id)}
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight">{t.title}</h1>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              {zoneName} · {typeName}
            </p>
          </div>
          <StatusBadge status={t.status} />
        </div>

        <dl className="mt-4 grid gap-3 border-t border-[var(--color-line)] pt-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="field-label">Descripció</dt>
            <dd className="whitespace-pre-wrap">
              {t.description || <span className="text-[var(--color-muted)]">—</span>}
            </dd>
            <FieldImages
              ticketId={t.id}
              field="description"
              images={imagesFor('description')}
              canEdit={false}
            />
          </div>
          <div>
            <dt className="field-label">Solució proposada</dt>
            <dd className="whitespace-pre-wrap">
              {t.agreed_solution || (
                <span className="text-[var(--color-muted)]">Encara no n’hi ha</span>
              )}
            </dd>
            <FieldImages
              ticketId={t.id}
              field="agreed_solution"
              images={imagesFor('agreed_solution')}
              canEdit={false}
            />
          </div>
        </dl>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="field-label">Data de publicació</dt>
            <dd>{formatDate(t.created_at)}</dd>
          </div>
          <div>
            <dt className="field-label">Data prevista de resolució</dt>
            <dd>
              {t.due_date ? formatDate(t.due_date) : <span className="text-[var(--color-muted)]">—</span>}
            </dd>
          </div>
          <div>
            <dt className="field-label">Data de resolució</dt>
            <dd>
              {t.resolved_at ? formatDate(t.resolved_at) : <span className="text-[var(--color-muted)]">—</span>}
            </dd>
          </div>
          <div>
            <dt className="field-label">Assignat a</dt>
            <dd>{assignedTo ?? <span className="text-[var(--color-muted)]">Sense assignar</span>}</dd>
          </div>
        </dl>

        <p className="mt-3 border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-muted)]">
          Oberta per {nameOf(t.created_by) ?? 'algú'} · última modificació {formatDateTime(t.updated_at)}
        </p>
      </header>

      <ApprovalPanel
        ticketId={t.id}
        canApprove={approvals}
        approvals={{
          responsable: t.approved_responsable_at,
          tecnics: t.approved_tecnics_at,
          propietari: t.approved_propietari_at,
        }}
        approvedBy={{
          responsable: nameOf(t.approved_responsable_by),
          tecnics: nameOf(t.approved_tecnics_by),
          propietari: nameOf(t.approved_propietari_by),
        }}
      />

      {canEdit && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">Editar la fitxa</summary>
          <div className="mt-3">
            <TicketForm
              zones={zoneList}
              workTypes={typeList}
              assignees={(profiles ?? []) as Profile[]}
              teams={teams}
              ticket={t}
              descriptionImages={imagesFor('description')}
              solutionImages={imagesFor('agreed_solution')}
            />
          </div>
        </details>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">
          Comentaris{' '}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            ({allComments.length})
          </span>
        </h2>

        {allComments.length === 0 && (
          <p className="card p-6 text-center text-sm text-[var(--color-muted)]">
            Cap comentari encara.
          </p>
        )}

        <ul className="space-y-3">
          {allComments.map((c) => {
            const author = people.get(c.author_id) ?? null
            const canDelete = c.author_id === profile.id || isAdmin(profile)
            return (
              <li key={c.id} className="card p-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{displayName(author)}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {formatDateTime(c.created_at)}
                  </span>
                  {canDelete && (
                    <form action={deleteComment} className="ml-auto">
                      <input type="hidden" name="comment_id" value={c.id} />
                      <input type="hidden" name="ticket_id" value={t.id} />
                      <SubmitButton
                        className="text-xs font-semibold text-[var(--color-muted)] hover:text-red-700"
                        pendingLabel="…"
                      >
                        Esborrar
                      </SubmitButton>
                    </form>
                  )}
                </div>

                {c.body && <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>}

                {c.comment_images.length > 0 && (
                  <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {c.comment_images.map((img) => {
                      const url = signed.get(img.storage_path)
                      if (!url) return null
                      return (
                        <li key={img.id}>
                          <a href={url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt="Imatge del comentari"
                              className="aspect-4/3 w-full rounded-lg border border-[var(--color-line)] object-cover"
                              loading="lazy"
                            />
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>

        {canComment ? (
          <CommentForm ticketId={t.id} />
        ) : (
          <p className="card p-4 text-sm text-[var(--color-muted)]">
            No tens permís per comentar aquesta fitxa.
          </p>
        )}
      </section>

      {isAdmin(profile) && (
        <form action={deleteTicket} className="pt-4 text-right">
          <input type="hidden" name="id" value={t.id} />
          <SubmitButton className="text-sm font-semibold text-red-700" pendingLabel="Esborrant…">
            Esborrar aquesta fitxa
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
