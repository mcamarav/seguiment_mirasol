/** La foto de portada del projecte. El camí sempre comença per l'id del
 * projecte perquè la RLS del bucket sàpiga de quin projecte és cada fitxer
 * (vegeu les policies `project_images_*` de `supabase/schema.sql`). */

export const PROJECT_PHOTO_BUCKET = 'project-images'

/** Prou llarg per a una sessió de feina, que la portada es mira de passada. */
export const PROJECT_PHOTO_TTL = 60 * 60 * 8

/** Un camí nou per a cada foto: així el navegador no ensenya la vella en canviar-la. */
export function newProjectPhotoPath(projectId: number, ext: string): string {
  return `${projectId}/${crypto.randomUUID()}.${ext}`
}

/** El projecte al qual pertany un camí de foto, o null si no en té la forma.
 * Ho comprova el servidor abans de desar: el camí ve del navegador. */
export function projectOfPhotoPath(path: string): number | null {
  const id = Number(path.split('/')[0])
  return Number.isInteger(id) && id > 0 ? id : null
}
