-- Pedaç: afegeix l'ordre de la zona a la vista ticket_list.
--
-- La llista es pot ordenar per zona seguint el sort_order del catàleg (el
-- recorregut per la casa), i per fer-ho a PostgREST la columna ha de ser a la
-- vista. S'afegeix al final perquè `create or replace view` només accepta
-- columnes noves a la cua.
--
-- És el subconjunt de supabase/schema.sql que canvia, per no haver de
-- reexecutar el fitxer sencer (que al final recrea els catàlegs de zones i
-- tipus de feina). Executa'l sencer al SQL Editor de Supabase.

begin;

create or replace view public.ticket_list with (security_invoker = on) as
select
  t.id,
  t.title,
  t.description,
  t.status,
  t.zone_id,
  z.name  as zone_name,
  t.work_type_id,
  wt.name as work_type_name,
  t.agreed_solution,
  t.approved_responsable_at,
  t.approved_tecnics_at,
  t.approved_propietari_at,
  t.review_tecnics_at,
  t.review_propietari_at,
  t.due_date,
  t.resolved_at,
  t.assignee_id,
  a.full_name as assignee_name,
  a.email     as assignee_email,
  t.assignee_team_id,
  tm.name     as assignee_team_name,
  t.created_at,
  t.updated_at,
  (select count(*) from public.comments c where c.ticket_id = t.id) as comment_count,
  z.sort_order as zone_sort_order
from public.tickets t
left join public.zones      z  on z.id  = t.zone_id
left join public.work_types wt on wt.id = t.work_type_id
left join public.profiles   a  on a.id  = t.assignee_id
left join public.teams      tm on tm.id = t.assignee_team_id;

grant select on public.ticket_list to authenticated;

commit;
