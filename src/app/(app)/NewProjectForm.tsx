'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadProjectPhoto } from '@/lib/project-photo-client'
import { useGlobalPending } from '@/components/PendingOverlay'
import { createProject, setProjectPhoto } from './project-actions'

/** Crear un projecte nou: nom, adreça (opcional) i foto de portada (opcional).
 *
 * La foto es puja DESPRÉS de crear el projecte perquè el camí del fitxer al
 * bucket comença per l'id del projecte, que fins llavors no existeix; per això
 * el formulari no és un `action={...}` normal sinó un submit a mà. */
export function NewProjectForm() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useGlobalPending(busy)

  function pickPhoto(file: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  function clearPhoto() {
    pickPhoto(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    // El fitxer no porta `name`, així que no viatja dins del FormData de
    // l'acció: es puja a part, directament al bucket.
    const data = new FormData(event.currentTarget)
    const file = fileInput.current?.files?.[0] ?? null

    setError(null)
    setBusy(true)
    try {
      setStatus('Creant el projecte…')
      const result = await createProject(data)
      if (result.error || !result.project) {
        throw new Error(result.error ?? 'No s’ha pogut crear el projecte.')
      }

      if (file) {
        setStatus('Pujant la foto…')
        const path = await uploadProjectPhoto(result.project.id, file)
        const saved = await setProjectPhoto(result.project.id, path)
        // El projecte ja existeix; si només ha fallat la foto val més dir-ho i
        // deixar que la torni a provar des de la fitxa del projecte.
        if (saved.error) throw new Error(saved.error)
      }

      formRef.current?.reset()
      clearPhoto()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hi ha hagut un error.')
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr]">
        <label className="block">
          <span className="field-label">Nom del projecte</span>
          <input name="name" required className="field" placeholder="Casa del Pi" />
        </label>
        <label className="block">
          <span className="field-label">Adreça (opcional)</span>
          <input name="slug" className="field" placeholder="casa-del-pi" />
        </label>
      </div>

      <div className="flex items-center gap-3">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg border border-[var(--color-line)] object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <span className="field-label">Foto (opcional)</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-[var(--color-muted)] file:mr-2 file:rounded-lg file:border file:border-[var(--color-line)] file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-semibold"
          />
        </div>
        {preview && (
          <button
            type="button"
            onClick={clearPhoto}
            disabled={busy}
            className="shrink-0 text-xs font-semibold text-[var(--color-muted)]"
          >
            Treure
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creant…' : 'Crear projecte'}
        </button>
        {status && <p className="text-xs text-[var(--color-muted)]">{status}</p>}
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    </form>
  )
}
