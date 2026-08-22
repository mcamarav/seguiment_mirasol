/** Rutes de l'app. Aquí no hi ha res de servidor a propòsit: també ho fan servir
 * components de client (els filtres de la llista, per exemple). */

/** Enllaç a una pantalla de dins del projecte: projectPath('mirasol', '/tickets/nova'). */
export function projectPath(slug: string, sub = ''): string {
  return `/p/${slug}${sub}`
}

/** Slug a partir d'un nom, per als projectes nous: «Casa del Pi» → «casa-del-pi». */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
