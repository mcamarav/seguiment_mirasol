'use client'

import { createClient } from '@/lib/supabase/client'
import { shrinkImage } from '@/lib/image'
import { PROJECT_PHOTO_BUCKET, newProjectPhotoPath } from '@/lib/project-photo'

/** Puja la foto de portada al bucket (reduïda, com la resta d'imatges) i
 * retorna el camí, que després es desa al projecte amb `setProjectPhoto`.
 * Puja des del navegador, com les imatges de les fitxes: així no passa pel
 * servidor de Next i no topa amb el límit de mida de les server actions. */
export async function uploadProjectPhoto(projectId: number, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El fitxer ha de ser una imatge.')

  const blob = await shrinkImage(file)
  const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() ?? 'jpg')
  const path = newProjectPhotoPath(projectId, ext)

  const { error } = await createClient()
    .storage.from(PROJECT_PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream' })
  if (error) throw new Error(`No s’ha pogut pujar la foto: ${error.message}`)

  return path
}
