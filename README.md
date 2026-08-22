# Seguiment d'obres (versió multiprojecte)

Web app per fer seguiment de les tasques pendents d'una obra — o de **diverses
obres alhora**, cada una amb la seva gent. Next.js (App Router) + Supabase
(autenticació, Postgres i emmagatzematge d'imatges).

> Aquesta és la branca **`multiprojecte`**, amb la seva pròpia base de dades i la
> seva pròpia URL. La branca `main` continua sent la versió d'una sola obra
> («Seguiment Mirasol»), en producció i intacta. Els dos desplegaments no
> comparteixen res: ni base de dades, ni imatges, ni comptes.

## Què fa

- **Projectes** (obres). Cada projecte té les seves fitxes, les seves zones i
  tipus, els seus equips i la seva numeració (`#001` dins de cada obra). La URL
  el porta al davant: `/p/mirasol`, `/p/casa-del-pi`.
- **Llista de projectes** a la pantalla d'inici (`/`): les obres a les quals
  tens accés, amb la **foto de portada** de cada una i quantes fitxes hi ha
  pendents. Des d'aquí l'administrador crea projectes nous —amb foto i tot— i
  qui administra una obra li canvia la foto.
- **Accés per projecte**: una persona veu els projectes on té accés i prou. Qui
  no és membre d'un projecte no en veu res — ni les fitxes, ni les zones, ni la
  llista de qui hi treballa. Es reparteix a l'administració de cada projecte.
- **Usuaris** amb correu + contrasenya, **només per invitació**: no es pot
  registrar ningú que l'administrador no hagi autoritzat abans indicant el seu
  correu. La invitació ja pot portar a quins projectes tindrà accés.
- **Fitxes** amb número (`#001`), nom curt, descripció, **zona** i **tipus**
  (p. ex. `Habitació 1 · Pintura`), data prevista de resolució, persona o equip
  assignat, solució proposada i comentaris amb imatges.
- **Tres aprovacions** — responsable, tècnics i propietari — sobre la solució
  proposada. La fitxa queda **resolta** automàticament quan totes tres hi són,
  i la data de resolució es calcula sola (la de l'última aprovació).
- **Revisió**: quan el responsable ja ha marcat la feina com a feta, el tècnic i
  el propietari poden demanar **revisió** en lloc d'aprovar. La fitxa passa a
  **A revisar** i torna a mans del responsable, que quan ho hagi refet la marca
  com a **Revisat**: això retira les peticions de revisió i reinicia les
  aprovacions del tècnic i del propietari, que han de tornar a dir-hi la seva.
  Qui ha demanat la revisió també la pot desfer.
- **Estat calculat** per la base de dades, no s'edita a mà:

  | Estat | Quan |
  |---|---|
  | Obert | per defecte |
  | Solució proposada | hi ha text al camp «Solució proposada» |
  | A revisar | el responsable ha aprovat i el tècnic o el propietari han demanat revisió |
  | Resolt | les tres aprovacions fetes |

  Si algú reescriu la solució proposada, les aprovacions i les peticions de
  revisió que ja s'havien fet es reinicien: cal tornar a passar el circuit.

- **Llistat** (dins de cada projecte) amb pestanyes Pendents / Per validar /
  Resolts, filtres per zona, tipus i persona o equip assignat, ordenació, cerca
  per text, resum de cada fitxa i exportació a PDF del que s'està veient.

## Permisos

Hi ha **un sol permís global**: administrador de la instal·lació. Tota la resta
és de cada projecte, així que la mateixa persona pot ser responsable a una obra i
només lectora a una altra.

| Permís | On es dona | Què pot fer |
|---|---|---|
| Administrador | `/admin` | Tot, a tots els projectes. Crea projectes, convida gent i reparteix accessos. |
| Administrar el projecte | `/p/<obra>/admin` | Tot dins d'aquell projecte: accessos, equips, zones i tipus, i aprovar en nom de qualsevol actor. |
| Crear fitxes | `/p/<obra>/admin` | Obrir fitxes noves en aquell projecte (i editar les que ha obert). |
| Editar totes | `/p/<obra>/admin` | Editar qualsevol fitxa del projecte. |
| Accés, sense res marcat | `/p/<obra>/admin` | Consultar les fitxes del projecte; comentar les que tingui assignades o les del seu equip. |

Les **aprovacions** van pels equips de cada projecte: un equip pot tenir el rol
global de `Tècnics` o de `Propietaris` dins de la seva obra, i els seus membres
aproven aquella casella (i poden comentar) a totes les fitxes del projecte. La
casella **Responsable** l'aprova qui tingui la fitxa assignada, sigui una persona
o un equip sencer.

Tot això s'aplica **a la base de dades** (Row Level Security + triggers), no
només a la interfície: ningú pot veure un projecte que no li toca ni marcar una
aprovació que no li correspon encara que manipuli les peticions. Qui pot aprovar
però no editar només pot tocar les seves caselles: si intenta canviar el text de
la fitxa, la base de dades l'atura.

## Posada en marxa

### 1. Crear el projecte de Supabase

Aquesta versió necessita una base de dades **nova i buida**: l'esquema no és
compatible amb el de la branca `main` (les taules porten `project_id`).

1. Entra a [supabase.com](https://supabase.com) i crea un projecte nou.
2. Ve a **SQL Editor**, obre una consulta nova, enganxa tot el contingut de
   [`supabase/schema.sql`](supabase/schema.sql) i executa'l. Això crea les
   taules, els permisos, el *bucket* d'imatges, un primer projecte («Mirasol»)
   amb les seves zones i tipus, i la invitació de l'administrador inicial.
3. A **Authentication → Providers → Email**, comprova que *Email* està actiu.

> Si l'SQL falla al tros de `storage.objects` per manca de permisos, crea les
> polítiques dels *buckets* `ticket-images` i `project-images` des de
> **Storage → Policies** amb els mateixos criteris que hi ha al fitxer.

> **Si la base de dades ja existia** (l'esquema multiprojecte ja executat abans
> de les fotos de portada), no cal tornar a passar `schema.sql`: executa només
> [`supabase/afegeix_foto_projectes.sql`](supabase/afegeix_foto_projectes.sql),
> que afegeix la columna `projects.image_path` i el *bucket* `project-images`.

### 2. Configurar l'app

```bash
cp .env.local.example .env.local
```

Omple els dos valors amb els de **Project Settings → API** del projecte de
Supabase NOU: `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 3. Executar-la

```bash
npm install && npm run dev
```

Obre http://localhost:3000.

### 4. Primer usuari

L'esquema ja sembra la invitació d'administrador per a **marc.camara@gmail.com**.
Ve a `/registre` amb aquest correu, tria una contrasenya i entraràs com a
administrador. Si vols un altre correu, canvia'l a l'`insert into
public.invitations` de `supabase/schema.sql` abans d'executar-lo.

### 5. Projectes i gent

- A `/admin → Projectes` es creen les obres. Cada una neix amb la llista de
  zones i tipus per defecte, que després es retoca a la seva administració.
- A `/admin → Convidats` s'autoritza un correu i es marca a quins projectes
  tindrà accés. Passa-li l'enllaç de l'app i es crearà la contrasenya ell
  mateix a `/registre`. Qualsevol altre correu és rebutjat.
- A `/p/<obra>/admin` es reparteixen els permisos de dins del projecte, els
  equips i les zones i tipus.

Que només es pugui registrar qui està convidat s'aplica **a la base de dades**:
el trigger `handle_new_user()` avorta la creació del compte si el correu no
consta com a invitació pendent.

## Migrar les dades de la versió d'una sola obra

Els scripts de [`supabase/migracio/`](supabase/migracio) porten les dades de la
base de dades actual (la de `main`) al projecte «Mirasol» de la base nova. Es
conserven **els ids de les fitxes** (els camins de les imatges hi apunten) i el
número que es mostra (`#007` continua sent `#007`), i els permisos globals que
tenia cada persona passen a ser els seus permisos dins d'aquell projecte.

Cal, de la base ANTIGA: la cadena de connexió (*Project Settings → Database →
Connection string → URI*) i la `service_role` key. De la NOVA: les mateixes dues
coses. La base antiga només es llegeix.

```bash
# 1. Exportar (només llegeix la base antiga)
OLD_DB_URL="postgresql://postgres:...@db.ANTIGA.supabase.co:5432/postgres" \
  ./supabase/migracio/01_exporta.sh export

# 2. Recrear els comptes a la base nova, amb els mateixos ids i contrasenyes
NEW_SUPABASE_URL="https://NOVA.supabase.co" NEW_SERVICE_KEY="…" \
  node supabase/migracio/02_usuaris.mjs export

# 3. Carregar les dades dins del projecte 'mirasol'
NEW_DB_URL="postgresql://postgres:...@db.NOVA.supabase.co:5432/postgres" \
  ./supabase/migracio/03_importa.sh export mirasol

# 4. Copiar les imatges d'un bucket a l'altre
OLD_SUPABASE_URL="https://ANTIGA.supabase.co" OLD_SERVICE_KEY="…" \
NEW_SUPABASE_URL="https://NOVA.supabase.co"   NEW_SERVICE_KEY="…" \
  node supabase/migracio/04_imatges.mjs
```

Cada pas s'atura si troba res que no quadri (un compte que no s'ha pogut recrear
amb el seu id, una imatge que no hi és) en lloc de deixar les dades a mitges. El
pas 3 va tot dins d'una transacció.

## Desplegament a Vercel

Aquesta branca es desplega com un **projecte de Vercel a part**, `seguiment-obres`,
per tenir la seva URL i les seves variables d'entorn sense tocar la producció de
`main`. El projecte ja està creat, connectat a aquest repositori i amb el preset
de Next.js. Queda per fer, al dashboard de Vercel:

1. **Settings → Git → Production Branch**: canvia `main` per `multiprojecte`.
   Mentre no es faci, el que es desplega a producció d'aquest projecte és `main`.
2. **Settings → Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL` i
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` amb els valors del projecte de Supabase NOU.
3. A Supabase, **Authentication → URL Configuration**, posa el domini nou com a
   *Site URL* perquè els correus de confirmació apuntin bé.

El projecte de Vercel de `main` (`seguiment_mirasol`) no es toca: continua
desplegant `main` amb la seva base de dades. Com que els dos projectes miren el
mateix repositori, en pujar commits a `multiprojecte` també en generarà un
*preview* — que no serveix de res, perquè apuntaria a la base de dades antiga.
Es pot deixar estar o silenciar-lo des de **Settings → Git → Ignored Build Step**
del projecte vell.

## Estructura

```
supabase/schema.sql            Esquema, RLS, triggers, buckets i dades inicials
supabase/afegeix_foto_projectes.sql  Actualització: foto de portada dels projectes
supabase/migracio/             Migració des de la versió d'una sola obra
src/middleware.ts              Refresc de sessió i protecció de rutes
src/lib/project.ts             Càrrega del projecte i dels permisos de dins
src/lib/permissions.ts         Qui pot què (sempre dins d'un projecte)
src/lib/routes.ts              /p/<obra>/… (també des del client)
src/app/entrar, /registre      Autenticació (registre només per invitació)
src/app/(app)/page.tsx         Llista de projectes (amb foto i projecte nou)
src/app/(app)/project-actions.ts  Crear, amagar, esborrar i posar foto a un projecte
src/app/(app)/admin/           Projectes, convidats i comptes (administració general)
src/app/(app)/p/[projecte]/    Tot el que és de dins d'una obra:
  page.tsx                       llistat de fitxes amb filtres
  tickets/                       nova fitxa, detall, aprovacions, comentaris, PDF
  admin/                         accessos, equips, zones i tipus del projecte
```

## Notes

- Les imatges es pugen des del navegador directament a Supabase Storage,
  reduïdes a 1600 px de costat màxim per no cremar dades al mòbil. El *bucket*
  és privat; les fitxes les mostren amb URLs signades d'una hora. El camí sempre
  comença per l'id **global** de la fitxa, no pel número que es mostra.
- Les fotos de portada van a part, al *bucket* privat `project-images`, i el seu
  camí comença per l'id del projecte: la mira qui té accés a l'obra i només la
  canvia qui l'administra. Es guarda una sola foto per projecte; en canviar-la,
  l'anterior s'esborra del *bucket*.
- Les aprovacions i les peticions de revisió **es reinicien** (trigger
  `reset_approvals_on_edit`) si algú edita la fitxa després que ja s'hagin
  donat: cal tornar a passar el circuit per a la versió nova.
- Una fitxa no es pot moure de projecte, i la seva zona, tipus, equip i persona
  assignada han de ser del mateix projecte: ho comprova el trigger
  `check_ticket_project`.
- Treure algú d'un projecte també el treu dels equips d'aquell projecte; les
  fitxes que hagi creat es queden.
- Esborrar un projecte només es pot fer si està buit. Per deixar-ne un de banda
  sense perdre res, s'amaga.
