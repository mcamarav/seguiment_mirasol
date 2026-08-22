// Recrea els comptes a la base de dades NOVA, amb el mateix id i la mateixa
// contrasenya que tenien (es passa el hash tal qual, no la contrasenya en clar).
//
//   NEW_SUPABASE_URL="https://yyy.supabase.co" \
//   NEW_SERVICE_KEY="service_role key de la base nova" \
//     node supabase/migracio/02_usuaris.mjs export
//
// Mantenir els ids és imprescindible: les fitxes, els comentaris i les
// aprovacions hi apunten. Si l'API no els respectés, l'script s'atura abans de
// deixar les dades a mitges.
//
// De passada crea la invitació de cada correu, que és el que deixa passar el
// trigger handle_new_user() de la base nova (i és qui crea el perfil).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEW_SUPABASE_URL
const key = process.env.NEW_SERVICE_KEY
if (!url || !key) {
  console.error('Falten NEW_SUPABASE_URL i/o NEW_SERVICE_KEY.')
  process.exit(1)
}

const dir = process.argv[2] ?? 'export'
const users = JSON.parse(readFileSync(`${dir}/usuaris.json`, 'utf8'))
if (users.length === 0) {
  console.error(`No hi ha cap usuari a ${dir}/usuaris.json.`)
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

// Qui ja hi és (per poder tornar a executar l'script sense duplicar res).
const existing = new Map()
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
  if (error) {
    console.error('No s’han pogut llegir els usuaris existents:', error.message)
    process.exit(1)
  }
  for (const u of data.users) existing.set(u.email?.toLowerCase(), u.id)
  if (data.users.length < 200) break
}

let creats = 0
let saltats = 0

for (const user of users) {
  const email = user.email.toLowerCase()

  if (existing.has(email)) {
    if (existing.get(email) !== user.id) {
      console.error(
        `ATURAT: ${email} ja existeix a la base nova amb un id diferent ` +
          `(${existing.get(email)} en lloc de ${user.id}). Esborra'l abans de continuar.`,
      )
      process.exit(1)
    }
    saltats += 1
    continue
  }

  const { error: invError } = await supabase
    .from('invitations')
    .upsert(
      { email, is_admin: user.is_admin, note: 'Migrat de la versió anterior' },
      { onConflict: 'email' },
    )
  if (invError) {
    console.error(`ATURAT: no s’ha pogut convidar ${email}: ${invError.message}`)
    process.exit(1)
  }

  const { data, error } = await supabase.auth.admin.createUser({
    id: user.id,
    email,
    password_hash: user.encrypted_password,
    email_confirm: true,
    user_metadata: user.full_name ? { full_name: user.full_name } : {},
  })

  if (error) {
    console.error(`ATURAT: no s’ha pogut crear ${email}: ${error.message}`)
    process.exit(1)
  }

  if (data.user.id !== user.id) {
    console.error(
      `ATURAT: ${email} s’ha creat amb un id nou (${data.user.id}) en lloc del seu ` +
        `(${user.id}). Sense els ids originals les fitxes es quedarien sense autor: ` +
        `esborra l’usuari creat i actualitza @supabase/supabase-js abans de tornar-hi.`,
    )
    process.exit(1)
  }

  // El trigger ha creat el perfil; se li torna la data d'alta original.
  await supabase.from('profiles').update({ created_at: user.created_at }).eq('id', user.id)

  creats += 1
  console.log(`· ${email}${user.is_admin ? ' (administrador)' : ''}`)
}

console.log(`\n${creats} comptes creats, ${saltats} que ja hi eren.`)
console.log('Ara ja es pot executar 03_importa.sh.')
