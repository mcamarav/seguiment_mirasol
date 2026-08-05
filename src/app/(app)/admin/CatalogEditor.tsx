import { addCatalogItem, renameCatalogItem, toggleCatalogItem } from './actions'
import type { Zone } from '@/lib/types'

/** Editor de llistes simples (zones o tipus): afegir, reanomenar, activar/desactivar. */
export function CatalogEditor({
  table,
  title,
  hint,
  items,
}: {
  table: 'zones' | 'work_types'
  title: string
  hint: string
  items: Zone[]
}) {
  return (
    <section className="card p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>

      <form action={addCatalogItem} className="mt-3 flex gap-2">
        <input type="hidden" name="table" value={table} />
        <input name="name" required className="field" placeholder="Afegir…" />
        <button type="submit" className="btn btn-secondary shrink-0">
          Afegir
        </button>
      </form>

      <ul className="mt-3 divide-y divide-[var(--color-line)]">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-2">
            <form action={renameCatalogItem} className="flex min-w-0 flex-1 gap-2">
              <input type="hidden" name="table" value={table} />
              <input type="hidden" name="id" value={item.id} />
              <input
                name="name"
                defaultValue={item.name}
                className={`field ${item.active ? '' : 'text-[var(--color-muted)] line-through'}`}
              />
              <button
                type="submit"
                className="shrink-0 text-xs font-semibold text-[var(--color-brand)]"
              >
                Desar
              </button>
            </form>
            <form action={toggleCatalogItem} className="shrink-0">
              <input type="hidden" name="table" value={table} />
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="active" value={String(item.active)} />
              <button type="submit" className="text-xs font-semibold text-[var(--color-muted)]">
                {item.active ? 'Amagar' : 'Recuperar'}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  )
}
