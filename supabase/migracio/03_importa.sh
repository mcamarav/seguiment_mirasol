#!/usr/bin/env bash
# Carrega l'exportació del pas 01 a la base de dades NOVA i la transforma a
# l'esquema multiprojecte, dins d'un projecte concret.
#
#   NEW_DB_URL="postgresql://postgres:...@db.yyy.supabase.co:5432/postgres" \
#     ./supabase/migracio/03_importa.sh export mirasol
#
# Abans d'això han d'estar fets:
#   · supabase/schema.sql executat a la base nova (crea el projecte 'mirasol')
#   · el pas 02, que recrea els comptes amb els seus ids
#
# Les dades entren primer a un esquema de pas (migracio_v1) i d'allà a les taules
# de veritat, tot dins d'una transacció.
set -euo pipefail

: "${NEW_DB_URL:?Falta NEW_DB_URL amb la cadena de connexió de la base nova}"
IN="${1:-export}"
SLUG="${2:-mirasol}"
AQUI="$(cd "$(dirname "$0")" && pwd)"

for f in profiles teams team_members zones work_types tickets comments comment_images ticket_field_images; do
  [ -f "$IN/$f.csv" ] || { echo "Falta $IN/$f.csv (executa 01_exporta.sh)"; exit 1; }
done

psql "$NEW_DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
drop schema if exists migracio_v1 cascade;
create schema migracio_v1;

create table migracio_v1.profiles (
  id uuid, email text, full_name text,
  is_admin boolean, can_create boolean, can_edit_all boolean);
create table migracio_v1.teams (
  id bigint, name text, global_role text, created_at timestamptz);
create table migracio_v1.team_members (team_id bigint, user_id uuid);
create table migracio_v1.zones (id bigint, name text, sort_order int, active boolean);
create table migracio_v1.work_types (id bigint, name text, sort_order int, active boolean);
create table migracio_v1.tickets (
  id bigint, title text, description text, zone_id bigint, work_type_id bigint,
  agreed_solution text, due_date date, assignee_id uuid, assignee_team_id bigint,
  approved_responsable_at timestamptz, approved_responsable_by uuid,
  approved_tecnics_at timestamptz,     approved_tecnics_by uuid,
  approved_propietari_at timestamptz,  approved_propietari_by uuid,
  review_tecnics_at timestamptz,       review_tecnics_by uuid,
  review_propietari_at timestamptz,    review_propietari_by uuid,
  created_by uuid, created_at timestamptz, updated_at timestamptz);
create table migracio_v1.comments (
  id uuid, ticket_id bigint, author_id uuid, body text, created_at timestamptz);
create table migracio_v1.comment_images (
  id uuid, comment_id uuid, storage_path text, created_at timestamptz);
create table migracio_v1.ticket_field_images (
  id uuid, ticket_id bigint, field text, storage_path text, created_at timestamptz);

\copy migracio_v1.profiles from '$IN/profiles.csv' csv header
\copy migracio_v1.teams from '$IN/teams.csv' csv header
\copy migracio_v1.team_members from '$IN/team_members.csv' csv header
\copy migracio_v1.zones from '$IN/zones.csv' csv header
\copy migracio_v1.work_types from '$IN/work_types.csv' csv header
\copy migracio_v1.tickets from '$IN/tickets.csv' csv header
\copy migracio_v1.comments from '$IN/comments.csv' csv header
\copy migracio_v1.comment_images from '$IN/comment_images.csv' csv header
\copy migracio_v1.ticket_field_images from '$IN/ticket_field_images.csv' csv header
SQL

# Comprovació abans de tocar res: tots els usuaris de l'exportació han de tenir
# ja el seu compte a la base nova (pas 02), o les fitxes perdrien l'autor.
FALTEN=$(psql "$NEW_DB_URL" -X -A -t -c "
  select count(*) from migracio_v1.profiles v
   where not exists (select 1 from public.profiles p where p.id = v.id)")
if [ "$FALTEN" != "0" ]; then
  echo "Hi ha $FALTEN comptes de l'exportació que no existeixen a la base nova."
  echo "Executa primer 02_usuaris.mjs (i comprova que els ids s'hagin conservat)."
  exit 1
fi

psql "$NEW_DB_URL" -X -v ON_ERROR_STOP=1 -v slug="$SLUG" -f "$AQUI/03_transforma.sql"

psql "$NEW_DB_URL" -X -v ON_ERROR_STOP=1 -c "drop schema migracio_v1 cascade"

echo
echo "Fet. Ara toca copiar les imatges: 04_imatges.mjs"
