-- Passa les dades de la versió d'un sol projecte (ja carregades a l'esquema
-- `migracio_v1`) a l'esquema multiprojecte, dins d'un projecte concret.
--
-- El crida 03_importa.sh amb :slug (el projecte destí, per defecte 'mirasol').
-- Tot va dins d'una transacció: si alguna cosa falla no queda res a mitges.
--
-- Dues coses es conserven a propòsit:
--   · l'id de cada fitxa, perquè els camins de les imatges de Storage
--     ("{ticket_id}/…") continuïn valent
--   · el número que es mostra (#007), que aquí passa a ser `tickets.ref`
begin;

create temp view destinacio as select id from public.projects where slug = :'slug';

do $$ begin
  if not exists (select 1 from destinacio) then
    raise exception 'No hi ha cap projecte amb aquest slug: crea''l abans de migrar-hi res';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Accés al projecte, amb els permisos que cada persona tenia globalment
-- -----------------------------------------------------------------------------
insert into public.project_members (project_id, user_id, is_manager, can_create, can_edit_all)
select (select id from destinacio), p.id, false, v.can_create, v.can_edit_all
  from migracio_v1.profiles v
  join public.profiles p on p.id = v.id
on conflict (project_id, user_id) do update
  set can_create   = excluded.can_create,
      can_edit_all = excluded.can_edit_all;

-- -----------------------------------------------------------------------------
-- Zones i tipus. L'esquema nou ja n'havia sembrat una llista amb els mateixos
-- noms, així que es lliguen pel nom i només s'afegeixen les que faltin.
-- -----------------------------------------------------------------------------
insert into public.zones (project_id, name, sort_order, active)
select (select id from destinacio), v.name, v.sort_order, v.active
  from migracio_v1.zones v
on conflict (project_id, name) do update
  set sort_order = excluded.sort_order, active = excluded.active;

insert into public.work_types (project_id, name, sort_order, active)
select (select id from destinacio), v.name, v.sort_order, v.active
  from migracio_v1.work_types v
on conflict (project_id, name) do update
  set sort_order = excluded.sort_order, active = excluded.active;

create temp table map_zones as
select v.id as old_id, z.id as new_id
  from migracio_v1.zones v
  join public.zones z on z.name = v.name and z.project_id = (select id from destinacio);

create temp table map_work_types as
select v.id as old_id, w.id as new_id
  from migracio_v1.work_types v
  join public.work_types w on w.name = v.name and w.project_id = (select id from destinacio);

-- -----------------------------------------------------------------------------
-- Equips (ara són del projecte) i els seus membres
-- -----------------------------------------------------------------------------
insert into public.teams (project_id, name, global_role, created_at)
select (select id from destinacio), v.name, v.global_role, v.created_at
  from migracio_v1.teams v
on conflict (project_id, name) do update set global_role = excluded.global_role;

create temp table map_teams as
select v.id as old_id, t.id as new_id
  from migracio_v1.teams v
  join public.teams t on t.name = v.name and t.project_id = (select id from destinacio);

insert into public.team_members (team_id, user_id)
select m.new_id, v.user_id
  from migracio_v1.team_members v
  join map_teams m on m.old_id = v.team_id
  join public.project_members pm
    on pm.user_id = v.user_id and pm.project_id = (select id from destinacio)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Fitxes. Es manté l'id (Storage hi apunta) i el número que es mostra passa a
-- `ref`, que abans era l'id: així la #007 continua sent la #007.
-- `status` i `resolved_at` són columnes generades i no s'insereixen.
-- -----------------------------------------------------------------------------
insert into public.tickets (
  id, project_id, ref, title, description, zone_id, work_type_id, agreed_solution,
  due_date, assignee_id, assignee_team_id,
  approved_responsable_at, approved_responsable_by,
  approved_tecnics_at, approved_tecnics_by,
  approved_propietari_at, approved_propietari_by,
  review_tecnics_at, review_tecnics_by,
  review_propietari_at, review_propietari_by,
  created_by, created_at, updated_at
) overriding system value
select
  v.id,
  (select id from destinacio),
  v.id,
  v.title,
  v.description,
  mz.new_id,
  mw.new_id,
  v.agreed_solution,
  v.due_date,
  v.assignee_id,
  mt.new_id,
  v.approved_responsable_at, v.approved_responsable_by,
  v.approved_tecnics_at,     v.approved_tecnics_by,
  v.approved_propietari_at,  v.approved_propietari_by,
  v.review_tecnics_at,       v.review_tecnics_by,
  v.review_propietari_at,    v.review_propietari_by,
  v.created_by, v.created_at, v.updated_at
from migracio_v1.tickets v
left join map_zones      mz on mz.old_id = v.zone_id
left join map_work_types mw on mw.old_id = v.work_type_id
left join map_teams      mt on mt.old_id = v.assignee_team_id;

-- La seqüència d'ids ha de continuar després de l'últim que s'ha inserit.
do $$
declare
  seguent bigint;
begin
  select coalesce(max(id), 0) + 1 into seguent from public.tickets;
  execute format('alter table public.tickets alter column id restart with %s', seguent);
end $$;

-- -----------------------------------------------------------------------------
-- Comentaris i imatges (els ids són uuids: es copien tal qual, i els camins de
-- Storage també, perquè els ids de fitxa no han canviat)
-- -----------------------------------------------------------------------------
insert into public.comments (id, ticket_id, author_id, body, created_at)
select v.id, v.ticket_id, v.author_id, v.body, v.created_at
  from migracio_v1.comments v
  join public.tickets t on t.id = v.ticket_id
on conflict (id) do nothing;

insert into public.comment_images (id, comment_id, storage_path, created_at)
select v.id, v.comment_id, v.storage_path, v.created_at
  from migracio_v1.comment_images v
  join public.comments c on c.id = v.comment_id
on conflict (id) do nothing;

insert into public.ticket_field_images (id, ticket_id, field, storage_path, created_at)
select v.id, v.ticket_id, v.field, v.storage_path, v.created_at
  from migracio_v1.ticket_field_images v
  join public.tickets t on t.id = v.ticket_id
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Resum
-- -----------------------------------------------------------------------------
select
  (select name from public.projects where slug = :'slug')                      as projecte,
  (select count(*) from public.project_members
    where project_id = (select id from destinacio))                            as persones,
  (select count(*) from public.teams
    where project_id = (select id from destinacio))                            as equips,
  (select count(*) from public.zones
    where project_id = (select id from destinacio))                            as zones,
  (select count(*) from public.tickets
    where project_id = (select id from destinacio))                            as fitxes,
  (select count(*) from public.comments c join public.tickets t on t.id = c.ticket_id
    where t.project_id = (select id from destinacio))                          as comentaris,
  (select count(*) from public.comment_images)                                 as imatges_comentaris,
  (select count(*) from public.ticket_field_images)                            as imatges_fitxa;

commit;
