// Copia les imatges del bucket `ticket-images` de la base ANTIGA a la NOVA.
//
//   OLD_SUPABASE_URL="https://xxx.supabase.co" OLD_SERVICE_KEY="…" \
//   NEW_SUPABASE_URL="https://yyy.supabase.co" NEW_SERVICE_KEY="…" \
//     node supabase/migracio/04_imatges.mjs
//
// La llista de fitxers surt de la base NOVA (les files de comment_images i
// ticket_field_images que ha deixat el pas 03), no de recórrer el bucket: així
// es copia exactament el que les fitxes fan servir, i qualsevol imatge que falti
// a l'origen surt avisada al final.
//
// Els camins no canvien perquè els ids de fitxa s'han conservat, així que es pot
// tornar a executar sense por: el que ja hi és es sobreescriu igual.
import { createClient } from '@supabase/supabase-js'

const oldUrl = process.env.OLD_SUPABASE_URL
const oldKey = process.env.OLD_SERVICE_KEY
const newUrl = process.env.NEW_SUPABASE_URL
const newKey = process.env.NEW_SERVICE_KEY

if (!oldUrl || !oldKey || !newUrl || !newKey) {
  console.error('Falten OLD_SUPABASE_URL, OLD_SERVICE_KEY, NEW_SUPABASE_URL o NEW_SERVICE_KEY.')
  process.exit(1)
}

const BUCKET = 'ticket-images'
const PARALEL = 4

const origen = createClient(oldUrl, oldKey, { auth: { persistSession: false } })
const desti = createClient(newUrl, newKey, { auth: { persistSession: false } })

const paths = new Set()
for (const taula of ['comment_images', 'ticket_field_images']) {
  const { data, error } = await desti.from(taula).select('storage_path')
  if (error) {
    console.error(`No s’ha pogut llegir ${taula} de la base nova: ${error.message}`)
    process.exit(1)
  }
  for (const row of data ?? []) paths.add(row.storage_path)
}

const llista = [...paths]
console.log(`${llista.length} imatges per copiar.`)

let copiades = 0
const errors = []

async function copia(path) {
  const { data, error } = await origen.storage.from(BUCKET).download(path)
  if (error || !data) {
    errors.push(`${path}: no s’ha pogut baixar (${error?.message ?? 'buit'})`)
    return
  }
  const { error: upError } = await desti.storage
    .from(BUCKET)
    .upload(path, data, { contentType: data.type || 'application/octet-stream', upsert: true })
  if (upError) {
    errors.push(`${path}: no s’ha pogut pujar (${upError.message})`)
    return
  }
  copiades += 1
  if (copiades % 25 === 0) console.log(`  ${copiades}/${llista.length}…`)
}

// Unes quantes alhora: d'una en una és lent i totes de cop peta la connexió.
const cua = llista.slice()
await Promise.all(
  Array.from({ length: PARALEL }, async () => {
    for (let path = cua.shift(); path !== undefined; path = cua.shift()) await copia(path)
  }),
)

console.log(`\n${copiades} imatges copiades.`)
if (errors.length > 0) {
  console.log(`\n${errors.length} no s’han pogut copiar:`)
  for (const e of errors) console.log(`  · ${e}`)
  process.exit(1)
}
