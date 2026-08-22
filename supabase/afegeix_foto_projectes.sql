-- =============================================================================
-- Foto de portada dels projectes
--
-- Actualització per a una base de dades que ja té l'esquema multiprojecte
-- (`supabase/schema.sql`) executat. Afegeix:
--   · projects.image_path — el camí de la foto dins del bucket, o null
--   · el bucket privat `project-images` i les seves policies
--
-- Es pot executar diverses vegades sense fer mal. A les instal·lacions noves ja
-- ve tot dins de schema.sql i no cal executar res d'aquí.
-- =============================================================================

alter table public.projects add column if not exists image_path text;

-- El camí sempre comença per l'id del projecte ("{project_id}/...") perquè la
-- RLS pugui lligar cada fitxer al seu projecte: la mira qui hi té accés, i
-- només la canvia qui l'administra.
insert into storage.buckets (id, name, public)
values ('project-images','project-images', false)
on conflict (id) do nothing;

drop policy if exists project_images_select on storage.objects;
drop policy if exists project_images_insert on storage.objects;
drop policy if exists project_images_delete on storage.objects;
create policy project_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'project-images' and name ~ '^[0-9]+/'
    and public.is_project_member((split_part(name, '/', 1))::bigint));
create policy project_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-images' and name ~ '^[0-9]+/'
    and public.is_project_manager((split_part(name, '/', 1))::bigint));
create policy project_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-images' and name ~ '^[0-9]+/'
    and public.is_project_manager((split_part(name, '/', 1))::bigint));
