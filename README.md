# Seguiment Mirasol

Web app per fer seguiment de les tasques pendents de la construcció de l'habitatge.
Next.js (App Router) + Supabase (autenticació, Postgres i emmagatzematge d'imatges).

## Què fa

- **Usuaris** amb correu + contrasenya, **només per invitació**: no es pot
  registrar ningú que l'administrador no hagi autoritzat abans indicant el seu
  correu. La invitació ja porta el rol que tindrà.
- **Fitxes** amb ID (`#001`), nom curt, descripció, **zona** i **tipus**
  (p. ex. `Habitació 1 · Pintura`), data prevista de resolució, persona
  assignada, solució proposada i comentaris amb imatges.
- **Tres aprovacions** — responsable, tècnics i propietari — sobre la solució
  proposada. La fitxa queda **resolta** automàticament quan totes tres hi són,
  i la data de resolució es calcula sola (la de l'última aprovació).
- **Estat calculat** per la base de dades, no s'edita a mà:

  | Estat | Quan |
  |---|---|
  | Obert | per defecte |
  | Solució proposada | hi ha text al camp «Solució proposada» |
  | Resolt | les tres aprovacions fetes |

  Si algú reescriu la solució proposada, les aprovacions que ja s'havien fet
  es reinicien: cal tornar a aprovar-la els tres actors.

- **Llistat** amb pestanyes Pendents / Resolts / Tots, filtres per zona, tipus i
  persona assignada, ordenació (publicació, data prevista, data de resolució,
  nom…), cerca per text i resum de cada fitxa (estat, aprovacions, nre. de
  comentaris, data prevista). Un clic obre la fitxa en detall.

## Rols

| Rol | Què pot fer |
|---|---|
| Administrador | Tot, i aprovar en nom de qualsevol actor. Gestiona usuaris, zones i tipus. |
| Responsable | Crear i editar fitxes. Aprova la casella **Responsable**. |
| Tècnic | Crear i editar fitxes. Aprova la casella **Tècnics**. |
| Propietari | Crear i editar fitxes. Aprova la casella **Propietari**. |
| Comentador | Només afegir comentaris i imatges. |
| Lector | Només consultar. |

Els permisos s'apliquen **a la base de dades** (Row Level Security + triggers),
no només a la interfície: ningú pot marcar una aprovació que no li correspon
encara que manipuli les peticions.

## Posada en marxa

### 1. Crear el projecte de Supabase

1. Entra a [supabase.com](https://supabase.com) i crea un projecte nou (pla gratuït).
2. Ve a **SQL Editor**, obre una consulta nova, enganxa tot el contingut de
   [`supabase/schema.sql`](supabase/schema.sql) i executa'l. Això crea les taules,
   els permisos, el *bucket* d'imatges i les llistes inicials de zones i tipus.
3. A **Authentication → Providers → Email**, comprova que *Email* està actiu.
   Si vols estalviar-te els correus de confirmació mentre proves, desactiva
   *Confirm email*.

> Si l'SQL falla al tros de `storage.objects` per manca de permisos, crea les
> tres polítiques del *bucket* `ticket-images` des de **Storage → Policies**
> amb els mateixos criteris que hi ha al fitxer.

### 2. Configurar l'app

```bash
cp .env.local.example .env.local
```

Omple els dos valors amb els de **Project Settings → API** de Supabase:
`NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 3. Executar-la

```bash
npm install && npm run dev
```

Obre http://localhost:3000.

### 4. Primer usuari

L'esquema ja sembra la invitació d'administrador per a **marc.camara@gmail.com**.
Ve a `/registre` amb aquest correu, tria una contrasenya i entraràs com a
administrador. Si vols un altre correu, canvia'l a l'`insert into
public.invitations` de `supabase/schema.sql` abans d'executar-lo (o afegeix la
fila a mà des del Table Editor).

### 5. Convidar la resta de gent

A `/admin → Convidats`, escriu el correu i tria el rol. Passa-li l'enllaç de
l'app i es crearà la contrasenya ell mateix a `/registre`. Qualsevol altre correu
és rebutjat.

Això s'aplica **a la base de dades**: el trigger `handle_new_user()` avorta la
creació del compte si el correu no consta com a invitació pendent, així que no hi
ha manera de colar-s'hi saltant-se la interfície. Retirar una invitació pendent
la invalida; retirar-ne una ja utilitzada no esborra el compte (per fer-ho, ve a
**Authentication → Users** de Supabase).

## Desplegament a Vercel

1. Puja el repositori a GitHub.
2. A Vercel, *Add New → Project*, importa'l.
3. Afegeix les dues variables d'entorn (`NEXT_PUBLIC_SUPABASE_URL` i
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) i desplega.
4. A Supabase, **Authentication → URL Configuration**, posa el domini de Vercel
   com a *Site URL* perquè els correus de confirmació apuntin bé.

No cal res més: Supabase ja fa de base de dades i d'emmagatzematge d'imatges.

## Estructura

```
supabase/schema.sql          Esquema, RLS, triggers, bucket i dades inicials
src/middleware.ts            Refresc de sessió i protecció de rutes
src/lib/                     Client de Supabase, tipus, permisos, formats
src/app/entrar, /registre    Autenticació (registre només per invitació)
src/app/(app)/page.tsx       Llistat de fitxes amb filtres
src/app/(app)/tickets/       Nova fitxa, detall, aprovacions, comentaris
src/app/(app)/admin/         Convidats, usuaris i rols, zones i tipus
```

Les zones i els tipus són taules editables des de `/admin`: pots afegir-ne,
reanomenar-los o amagar-los sense tocar codi. Amagar-ne un no afecta les fitxes
que ja l'utilitzen.

## Notes

- Les imatges es pugen des del navegador directament a Supabase Storage,
  reduïdes a 1600 px de costat màxim per no cremar dades al mòbil. El *bucket*
  és privat; les fitxes les mostren amb URLs signades d'una hora.
- Les aprovacions **es reinicien** (trigger `reset_approvals_on_solution_change`)
  si algú reescriu la solució proposada després que ja s'hagin donat: calen
  les 3 de nou per a la versió nova del text.
- El camp «Assignat a» només ofereix usuaris amb rol admin/responsable/tècnic/
  propietari (els que poden editar fitxes).
