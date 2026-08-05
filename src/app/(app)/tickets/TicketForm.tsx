'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createTicket, updateTicket, type FormState } from './actions'
import { displayName } from '@/lib/format'
import type { Profile, Team, Ticket, WorkType, Zone } from '@/lib/types'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Desant…' : label}
    </button>
  )
}

export function TicketForm({
  zones,
  workTypes,
  assignees,
  teams,
  ticket,
}: {
  zones: Zone[]
  workTypes: WorkType[]
  assignees: Profile[]
  teams: Team[]
  ticket?: Ticket
}) {
  const isEdit = Boolean(ticket)
  const [state, formAction] = useActionState<FormState, FormData>(
    isEdit ? updateTicket : createTicket,
    {},
  )
  const hasAnyApproval = Boolean(
    ticket?.approved_responsable_at || ticket?.approved_tecnics_at || ticket?.approved_propietari_at,
  )

  return (
    <form action={formAction} className="card space-y-4 p-4">
      {ticket && <input type="hidden" name="id" value={ticket.id} />}

      <div>
        <label className="field-label" htmlFor="title">
          Nom curt *
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          className="field"
          defaultValue={ticket?.title ?? ''}
          placeholder="p. ex. Esquerda a la paret del passadís"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="zone_id">
            Zona
          </label>
          <select
            id="zone_id"
            name="zone_id"
            className="field"
            defaultValue={ticket?.zone_id ?? ''}
          >
            <option value="">— Sense zona —</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="work_type_id">
            Tipus
          </label>
          <select
            id="work_type_id"
            name="work_type_id"
            className="field"
            defaultValue={ticket?.work_type_id ?? ''}
          >
            <option value="">— Sense tipus —</option>
            {workTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="due_date">
            Data prevista de resolució
          </label>
          <input
            id="due_date"
            name="due_date"
            type="date"
            className="field"
            defaultValue={ticket?.due_date ?? ''}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="assignee">
            Assignat a
          </label>
          <select
            id="assignee"
            name="assignee"
            className="field"
            defaultValue={
              ticket?.assignee_id
                ? `user:${ticket.assignee_id}`
                : ticket?.assignee_team_id
                  ? `team:${ticket.assignee_team_id}`
                  : ''
            }
          >
            <option value="">— Sense assignar —</option>
            {teams.length > 0 && (
              <optgroup label="Equips">
                {teams.map((t) => (
                  <option key={`team:${t.id}`} value={`team:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Persones">
              {assignees.map((p) => (
                <option key={`user:${p.id}`} value={`user:${p.id}`}>
                  {displayName(p)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="description">
          Descripció
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          className="field"
          defaultValue={ticket?.description ?? ''}
          placeholder="Què passa, on exactament, des de quan…"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="agreed_solution">
          Solució proposada
        </label>
        <textarea
          id="agreed_solution"
          name="agreed_solution"
          rows={4}
          className="field"
          defaultValue={ticket?.agreed_solution ?? ''}
          placeholder="Descriu què es farà per resoldre-ho."
        />
        <p className="mt-1.5 text-xs text-[var(--color-muted)]">
          Quan hi escrius alguna cosa, la fitxa passa a l’estat{' '}
          <strong>Solució proposada</strong> i cal que la tornin a aprovar el
          responsable, els tècnics i el propietari.
          {hasAnyApproval && (
            <>
              {' '}
              Com que ja hi ha aprovacions fetes, si canvies aquest text{' '}
              <strong>es reiniciaran</strong>.
            </>
          )}
        </p>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Desat.</p>
      )}

      <div className="flex justify-end">
        <Submit label={isEdit ? 'Desar canvis' : 'Crear la fitxa'} />
      </div>
    </form>
  )
}
