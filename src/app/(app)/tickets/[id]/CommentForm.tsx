'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { shrinkImage } from '@/lib/image'
import { createComment } from '../actions'

const MAX_FILES = 6

export function CommentForm({ ticketId }: { ticketId: number }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!body.trim() && files.length === 0) {
      setError('Escriu un comentari o adjunta una imatge.')
      return
    }

    setBusy(true)
    try {
      const supabase = createClient()
      const paths: string[] = []

      for (const [index, file] of files.entries()) {
        setStatus(`Pujant imatge ${index + 1} de ${files.length}…`)
        const blob = await shrinkImage(file)
        const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() ?? 'bin')
        const path = `${ticketId}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('ticket-images')
          .upload(path, blob, { contentType: blob.type || 'application/octet-stream' })
        if (uploadError) throw new Error(`No s'ha pogut pujar ${file.name}: ${uploadError.message}`)
        paths.push(path)
      }

      setStatus('Desant el comentari…')
      const result = await createComment(ticketId, body, paths)
      if (result.error) throw new Error(result.error)

      setBody('')
      setFiles([])
      if (fileInput.current) fileInput.current.value = ''
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hi ha hagut un error.')
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <label className="field-label" htmlFor="comment-body">
        Nou comentari
      </label>
      <textarea
        id="comment-body"
        className="field"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escriu aquí…"
        disabled={busy}
      />

      <div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).slice(0, MAX_FILES)
            setFiles(picked)
          }}
          className="block w-full text-sm text-[var(--color-muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--color-line)] file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold"
        />
        {files.length > 0 && (
          <p className="mt-1.5 text-xs text-[var(--color-muted)]">
            {files.length} {files.length === 1 ? 'imatge' : 'imatges'} · màxim {MAX_FILES}
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-3">
        {status && <span className="text-sm text-[var(--color-muted)]">{status}</span>}
        <button type="submit" className="btn btn-primary ml-auto" disabled={busy}>
          {busy ? 'Enviant…' : 'Publicar'}
        </button>
      </div>
    </form>
  )
}
