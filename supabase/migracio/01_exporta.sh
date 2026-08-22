#!/usr/bin/env bash
# Exporta les dades de la base de dades ACTUAL (la d'un sol projecte) a fitxers
# locals. Només llegeix: no toca res de la base d'origen.
#
#   OLD_DB_URL="postgresql://postgres:...@db.xxx.supabase.co:5432/postgres" \
#     ./supabase/migracio/01_exporta.sh export
#
# La cadena de connexió és a Supabase > Project Settings > Database >
# Connection string > URI (la de la base ANTIGA).
set -euo pipefail

: "${OLD_DB_URL:?Falta OLD_DB_URL amb la cadena de connexió de la base antiga}"
OUT="${1:-export}"
mkdir -p "$OUT"

# Els usuaris surten en JSON perquè porten el hash de la contrasenya i el nom,
# que el pas 02 passa a l'API d'administració de la base nova per recrear-los amb
# el mateix id i la mateixa contrasenya.
psql "$OLD_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -o "$OUT/usuaris.json" -c "
  select coalesce(json_agg(t order by t.created_at)::text, '[]') from (
    select u.id,
           u.email,
           u.encrypted_password,
           p.full_name,
           p.is_admin,
           p.can_create,
           p.can_edit_all,
           u.created_at
      from auth.users u
      join public.profiles p on p.id = u.id
  ) t"

# La resta de taules, en CSV, amb les columnes explícites: així el pas 03 sap
# exactament què s'hi troba.
psql "$OLD_DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
\copy (select id, email, full_name, is_admin, can_create, can_edit_all from public.profiles order by created_at) to '$OUT/profiles.csv' csv header
\copy (select id, name, global_role, created_at from public.teams order by id) to '$OUT/teams.csv' csv header
\copy (select team_id, user_id from public.team_members order by team_id) to '$OUT/team_members.csv' csv header
\copy (select id, name, sort_order, active from public.zones order by id) to '$OUT/zones.csv' csv header
\copy (select id, name, sort_order, active from public.work_types order by id) to '$OUT/work_types.csv' csv header
\copy (select id, title, description, zone_id, work_type_id, agreed_solution, due_date, assignee_id, assignee_team_id, approved_responsable_at, approved_responsable_by, approved_tecnics_at, approved_tecnics_by, approved_propietari_at, approved_propietari_by, review_tecnics_at, review_tecnics_by, review_propietari_at, review_propietari_by, created_by, created_at, updated_at from public.tickets order by id) to '$OUT/tickets.csv' csv header
\copy (select id, ticket_id, author_id, body, created_at from public.comments order by created_at) to '$OUT/comments.csv' csv header
\copy (select id, comment_id, storage_path, created_at from public.comment_images order by created_at) to '$OUT/comment_images.csv' csv header
\copy (select id, ticket_id, field, storage_path, created_at from public.ticket_field_images order by created_at) to '$OUT/ticket_field_images.csv' csv header
SQL

echo "Exportat a $OUT:"
wc -l "$OUT"/*.csv
echo "usuaris: $(grep -o '"id"' "$OUT/usuaris.json" | wc -l | tr -d ' ')"
