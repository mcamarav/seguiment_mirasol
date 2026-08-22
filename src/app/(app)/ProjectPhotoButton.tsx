'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadProjectPhoto } from '@/lib/project-photo-client'
import { useGlobalPending } from '@/components/PendingOverlay'
import { removeProjectPhoto, setProjectPhoto } from './project-actions'

/** Canviar (o treure) la foto de portada d'un projecte que ja existeix. Surt a
 * sobre de la portada, a la llista de projectes, per a qui administra l'obra. */
export function ProjectPhotoButton({
  projectId,
  hasPhoto,
  className = '',
}: {
  projectId: number
  hasPhoto: boolean
  className?: string
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useGlobalPending(busy)

  async function run(work: () => Promise<{ error?: string }>) {
    setError(null)
    setBusy(true)
    try {
      const result = await work()
      if (result.error) throw new Error(result.error)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hi ha hagut un error.')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const buttonClass =
    'rounded-lg border border-[var(--color-line)] bg-white/90 px-2 py-1 text-xs font-semibold shadow-sm backdrop-blur'

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            void run(async () => setProjectPhoto(projectId, await uploadProjectPhoto(projectId, file)))
          }
        }}
      />

      <div className="flex gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className={buttonClass}
        >
          {busy ? '…' : hasPhoto ? 'Canviar foto' : 'Afegir foto'}
        </button>
        {hasPhoto && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => removeProjectPhoto(projectId))}
            className={`${buttonClass} text-[var(--color-muted)]`}
          >
            Treure
          </button>
        )}
      </div>

      {error && (
        <p className="max-w-[14rem] rounded-lg bg-white/90 px-2 py-1 text-right text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
