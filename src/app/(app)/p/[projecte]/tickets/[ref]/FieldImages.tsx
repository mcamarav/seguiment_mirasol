'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { shrinkImage } from '@/lib/image'
import { addFieldImages, deleteFieldImage } from '../actions'
import { useGlobalPending } from '@/components/PendingOverlay'
import type { TicketImageField } from '@/lib/types'

const MAX_FILES = 6

export function FieldImages({
  ticketId,
  field,
  images,
  canEdit,
}: {
  ticketId: number
  field: TicketImageField
  images: { id: string; url: string }[]
  canEdit: boolean
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  useGlobalPending(busy)

  async function handleDelete(imageId: string) {
    setError(null)
    setBusy(true)
    setDeleting(imageId)
    const result = await deleteFieldImage(imageId, ticketId)
    setBusy(false)
    setDeleting(null)
    if (result.error) setError(result.error)
    else router.refresh()
  }

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).slice(0, MAX_FILES)
    if (files.length === 0) return

    setError(null)
    setBusy(true)
    try {
      const supabase = createClient()
      const paths: string[] = []

      for (const [index, file] of files.entries()) {
        setStatus(`Pujant imatge ${index + 1} de ${files.length}…`)
        const blob = await shrinkImage(file)
        const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() ?? 'bin')
        const path = `${ticketId}/${field}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('ticket-images')
          .upload(path, blob, { contentType: blob.type || 'application/octet-stream' })
        if (uploadError) throw new Error(`No s'ha pogut pujar ${file.name}: ${uploadError.message}`)
        paths.push(path)
      }

      setStatus('Desant…')
      const result = await addFieldImages(ticketId, field, paths)
      if (result.error) throw new Error(result.error)

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hi ha hagut un error.')
    } finally {
      setBusy(false)
      setStatus(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  if (images.length === 0 && !canEdit) return null

  return (
    <div className="mt-2">
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((img) => (
            <li key={img.id} className="group relative">
              <a href={img.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  className="aspect-square w-full rounded-lg border border-[var(--color-line)] object-cover"
                  loading="lazy"
                />
              </a>
              {canEdit && (
                <button
                  type="button"
                  aria-label="Esborrar imatge"
                  onClick={() => handleDelete(img.id)}
                  disabled={busy}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white opacity-0 group-hover:opacity-100"
                >
                  {deleting === img.id ? '…' : '×'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
            className="block text-xs text-[var(--color-muted)] file:mr-2 file:rounded-lg file:border file:border-[var(--color-line)] file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-semibold"
          />
          {status && <p className="mt-1 text-xs text-[var(--color-muted)]">{status}</p>}
          {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        </div>
      )}
    </div>
  )
}
