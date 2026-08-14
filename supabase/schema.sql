-- =============================================================================
-- Seguiment Mirasol — esquema complet de Supabase
-- Executa aquest fitxer sencer a l'SQL Editor del teu projecte Supabase.
-- És idempotent en la mesura del possible: es pot tornar a executar sobre una
-- base de dades neta sense problemes.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Permisos d'usuari (independents dels equips)
--   is_admin      -> ho pot fer tot: crear, editar i esborrar qualsevol fitxa,
--                    aprovar en nom de qualsevol equip, gestionar equips i usuaris
--   can_create    -> pot crear fitxes noves
--   can_edit_all  -> pot editar qualsevol fitxa (no només les que ha creat)
-- Qui crea una fitxa sempre la pot editar, encara que no tingui can_edit_all.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  is_admin     boolean not null default false,
  can_create   boolean not null default false,
  can_edit_all boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Compatibilitat amb bases de dades creades abans de separar equip i rol.
alter table public.profiles add column if not exists is_admin     boolean not null default false;
alter table public.profiles add column if not exists can_create   boolean not null default false;
alter table public.profiles add column if not exists can_edit_all boolean not null default false;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    update public.profiles set is_admin = true where role::text = 'admin';
    alter table public.profiles drop column role;
  end if;
end $$;

-- Helpers de permisos. SECURITY DEFINER per evitar recursió d'RLS.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.can_create()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.is_admin or p.can_create from public.profiles p where p.id = auth.uid()), false);
$$;

-- -----------------------------------------------------------------------------
-- Equips: grups d'usuaris lliures (els crea i gestiona un admin). Una persona
-- pot pertànyer a diversos equips.
--
-- Un equip pot tenir un "rol global" (tecnics / propietaris): els membres
-- d'aquell equip poden aprovar la casella corresponent i veure/comentar
-- TOTES les fitxes, no només les que tenen assignades. Com a molt un equip
-- pot tenir cada rol global (teams_global_role_unique).
--
-- La casella "Responsable" no té equip global fix: l'aprova qui tingui la
-- fitxa assignada (una persona o un equip sencer, camp assignee_id /
-- assignee_team_id de tickets).
-- -----------------------------------------------------------------------------
create table if not exists public.teams (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  global_role text check (global_role in ('tecnics','propietaris')),
  created_at  timestamptz not null default now()
);
create unique index if not exists teams_global_role_unique
  on public.teams(global_role) where global_role is not null;

create table if not exists public.team_members (
  team_id    bigint not null references public.teams(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members(user_id);

-- Membre d'un equip amb aquest rol global ('tecnics' o 'propietaris').
create or replace function public.is_global_team_member(p_global_role text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = auth.uid() and t.global_role = p_global_role
  );
$$;

-- -----------------------------------------------------------------------------
-- Convidats: NOMÉS es pot registrar qui tingui el correu autoritzat aquí.
-- La invitació ja no porta cap rol de fitxa (això ara és cosa dels equips,
-- que s'assignen des de /admin un cop la persona s'ha registrat); només marca
-- si la persona ha de començar sent administradora.
-- -----------------------------------------------------------------------------
create table if not exists public.invitations (
  email       text primary key,
  is_admin    boolean not null default false,
  note        text,
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null
);

alter table public.invitations add column if not exists is_admin boolean not null default false;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invitations' and column_name = 'role'
  ) then
    update public.invitations set is_admin = true where role::text = 'admin';
    alter table public.invitations drop column role;
  end if;
end $$;

-- L'antic tipus de rol únic (i les funcions que el feien servir) es netegen
-- al final d'aquest fitxer, un cop cap policy ni trigger ja no els referencia.

-- Equips que se li donaran automàticament quan la invitació s'accepti. Es pot
-- editar mentre estigui pendent; un cop acceptada, handle_new_user() converteix
-- aquestes files en team_members i les esborra.
create table if not exists public.invitation_teams (
  email   text   not null references public.invitations(email) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  primary key (email, team_id)
);

-- Els correus es guarden sempre normalitzats, per evitar duplicats per majúscules.
create or replace function public.normalize_invitation_email()
returns trigger language plpgsql as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end $$;

drop trigger if exists invitations_normalize_email on public.invitations;
create trigger invitations_normalize_email
  before insert or update on public.invitations
  for each row execute function public.normalize_invitation_email();

-- L'administrador inicial. Sense aquesta fila ningú no pot entrar a l'app:
-- no hi ha cap altra manera de crear el primer compte.
insert into public.invitations (email, is_admin, note)
values ('marc.camara@gmail.com', true, 'Administrador inicial')
on conflict (email) do update set is_admin = true;

-- Consulta pública (l'usa la pantalla de registre per avisar abans d'enviar el
-- formulari). La comprovació de veritat és el trigger de sota, que avorta la
-- creació del compte si el correu no està convidat.
create or replace function public.email_is_invited(p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invitations
    where email = lower(btrim(p_email)) and accepted_at is null
  );
$$;

grant execute on function public.email_is_invited(text) to anon, authenticated;

-- Només es pot registrar qui tingui una invitació pendent. Si el correu no
-- està convidat, l'excepció avorta la creació del compte a auth.users: no
-- queda cap usuari a mitges.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations where email = lower(btrim(new.email));

  if inv.email is null then
    raise exception 'CORREU_NO_CONVIDAT: el correu % no està autoritzat', new.email
      using errcode = '42501';
  end if;

  if inv.accepted_at is not null then
    raise exception 'CORREU_JA_UTILITZAT: la invitació de % ja s''ha fet servir', new.email
      using errcode = '42501';
  end if;

  insert into public.profiles (id, email, full_name, is_admin)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name',''),
    inv.is_admin
  );

  update public.invitations
     set accepted_at = now(), accepted_by = new.id
   where email = inv.email;

  -- Equips pre-assignats a la invitació: es donen ara i ja no calen més.
  insert into public.team_members (team_id, user_id)
  select it.team_id, new.id
    from public.invitation_teams it
   where it.email = inv.email
  on conflict do nothing;

  delete from public.invitation_teams where email = inv.email;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ningú que no sigui admin pot canviar-se els permisos.
create or replace function public.guard_profile_capabilities()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin
      or new.can_create is distinct from old.can_create
      or new.can_edit_all is distinct from old.can_edit_all)
     and not public.is_admin() then
    raise exception 'Només un administrador pot canviar els permisos d''un usuari';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_role on public.profiles;
drop trigger if exists profiles_guard_capabilities on public.profiles;
create trigger profiles_guard_capabilities
  before update on public.profiles
  for each row execute function public.guard_profile_capabilities();

-- -----------------------------------------------------------------------------
-- Zones i tipus de treball (classificació: "Habitació 1 · Pintura")
-- -----------------------------------------------------------------------------
create table if not exists public.zones (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort_order int  not null default 100,
  active     boolean not null default true
);

create table if not exists public.work_types (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort_order int  not null default 100,
  active     boolean not null default true
);

-- -----------------------------------------------------------------------------
-- Fitxes (tickets)
--
-- L'estat és una columna generada, no s'edita a mà:
--   resolt            -> les 3 aprovacions fetes
--   solucio_acordada  -> hi ha una solució proposada (agreed_solution) escrita
--   obert             -> la resta
-- Qualsevol edició d'una fitxa reinicia les 3 aprovacions (trigger
-- reset_approvals_on_edit): calen totes 3 de nou per a la versió nova.
--
-- Aquest estat és el gruixut, el que fan servir els filtres i les pestanyes.
-- L'estat que es mostra a l'usuari és més detallat (executat, pendent
-- aprovació tècnic, pendent aprovació propietari…) i es deriva de les tres
-- dates d'aprovació a l'aplicació: vegeu src/lib/status.ts.
-- -----------------------------------------------------------------------------
create table if not exists public.tickets (
  id                       bigint generated always as identity primary key,
  title                    text not null,
  description              text,
  zone_id                  bigint references public.zones(id) on delete set null,
  work_type_id             bigint references public.work_types(id) on delete set null,
  agreed_solution          text,
  approved_responsable_at  timestamptz,
  approved_responsable_by  uuid references public.profiles(id) on delete set null,
  approved_tecnics_at      timestamptz,
  approved_tecnics_by      uuid references public.profiles(id) on delete set null,
  approved_propietari_at   timestamptz,
  approved_propietari_by   uuid references public.profiles(id) on delete set null,
  status text generated always as (
    case
      when approved_responsable_at is not null
       and approved_tecnics_at     is not null
       and approved_propietari_at  is not null then 'resolt'
      when agreed_solution is not null and btrim(agreed_solution) <> ''
        then 'solucio_acordada'
      else 'obert'
    end
  ) stored,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Camps afegits després de la primera versió: es fan servir ALTER TABLE
-- perquè aquest fitxer sigui idempotent tant en instal·lacions noves com
-- en bases de dades que ja tenien la taula creada.
alter table public.tickets add column if not exists due_date date;
alter table public.tickets add column if not exists assignee_id
  uuid references public.profiles(id) on delete set null;
alter table public.tickets add column if not exists assignee_team_id
  bigint references public.teams(id) on delete set null;

alter table public.tickets drop constraint if exists tickets_assignee_single_check;
alter table public.tickets add constraint tickets_assignee_single_check
  check (not (assignee_id is not null and assignee_team_id is not null));

-- Data de resolució: automàtica, la data de l'última de les 3 aprovacions
-- (no es pot desquadrar amb l'estat perquè es calcula igual que ell).
alter table public.tickets add column if not exists resolved_at timestamptz
  generated always as (
    case
      when approved_responsable_at is not null
       and approved_tecnics_at     is not null
       and approved_propietari_at  is not null
        then greatest(approved_responsable_at, approved_tecnics_at, approved_propietari_at)
      else null
    end
  ) stored;

create index if not exists tickets_status_idx        on public.tickets(status);
create index if not exists tickets_zone_idx          on public.tickets(zone_id);
create index if not exists tickets_work_type_idx     on public.tickets(work_type_id);
create index if not exists tickets_assignee_idx      on public.tickets(assignee_id);
create index if not exists tickets_assignee_team_idx on public.tickets(assignee_team_id);
create index if not exists tickets_due_date_idx      on public.tickets(due_date);

-- Pot editar una fitxa concreta: admin, algú amb permís global d'editar-ho tot,
-- o qui l'ha creada.
create or replace function public.can_edit_ticket(p_ticket_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.is_admin or p.can_edit_all or t.created_by = auth.uid()
    from public.tickets t, public.profiles p
    where t.id = p_ticket_id and p.id = auth.uid()
  ), false);
$$;

-- L'equip (o la persona) assignat a la fitxa inclou l'usuari actual.
create or replace function public.is_assigned_to_ticket(p_ticket_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select t.assignee_id = auth.uid()
        or (t.assignee_team_id is not null and exists (
              select 1 from public.team_members tm
              where tm.team_id = t.assignee_team_id and tm.user_id = auth.uid()))
    from public.tickets t
    where t.id = p_ticket_id
  ), false);
$$;

-- Pot comentar (i per tant veure) una fitxa: qui la pot editar, qui hi és
-- assignat (persona o equip), o qualsevol membre dels equips globals de
-- tècnics/propietaris.
create or replace function public.can_comment_ticket(p_ticket_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_edit_ticket(p_ticket_id)
      or public.is_assigned_to_ticket(p_ticket_id)
      or public.is_global_team_member('tecnics')
      or public.is_global_team_member('propietaris');
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tickets_touch_updated_at on public.tickets;
create trigger tickets_touch_updated_at
  before update on public.tickets
  for each row execute function public.touch_updated_at();

-- Cada casella d'aprovació la pot marcar només qui té dret a fer-ho (o un
-- admin). El trigger també segella qui ha aprovat i quan.
--   Responsable -> qui té la fitxa assignada (persona o equip)
--   Tècnics     -> qualsevol membre de l'equip amb rol global 'tecnics'
--   Propietari  -> qualsevol membre de l'equip amb rol global 'propietaris'
create or replace function public.guard_ticket_approvals()
returns trigger
language plpgsql security definer set search_path = public as $$
declare admin boolean;
begin
  select p.is_admin into admin from public.profiles p where p.id = auth.uid();
  if admin is null then
    raise exception 'No s''ha trobat el perfil de l''usuari';
  end if;

  if new.approved_responsable_at is distinct from old.approved_responsable_at then
    if not admin and not (
      old.assignee_id = auth.uid()
      or (old.assignee_team_id is not null and exists (
            select 1 from public.team_members
            where team_id = old.assignee_team_id and user_id = auth.uid()))
    ) then
      raise exception 'Només qui té la fitxa assignada (o un admin) pot canviar aquesta aprovació';
    end if;
    new.approved_responsable_by :=
      case when new.approved_responsable_at is null then null else auth.uid() end;
  end if;

  if new.approved_tecnics_at is distinct from old.approved_tecnics_at then
    if not admin and not public.is_global_team_member('tecnics') then
      raise exception 'Només algú de l''equip de tècnics (o un admin) pot canviar aquesta aprovació';
    end if;
    new.approved_tecnics_by :=
      case when new.approved_tecnics_at is null then null else auth.uid() end;
  end if;

  if new.approved_propietari_at is distinct from old.approved_propietari_at then
    if not admin and not public.is_global_team_member('propietaris') then
      raise exception 'Només algú de l''equip de propietaris (o un admin) pot canviar aquesta aprovació';
    end if;
    new.approved_propietari_by :=
      case when new.approved_propietari_at is null then null else auth.uid() end;
  end if;

  return new;
end $$;

drop trigger if exists tickets_guard_approvals on public.tickets;
create trigger tickets_guard_approvals
  before update on public.tickets
  for each row execute function public.guard_ticket_approvals();

-- Editar qualsevol camp de la fitxa (títol, descripció, zona, tipus, solució
-- proposada, data prevista o assignació) reinicia les 3 aprovacions: calen
-- totes 3 de nou per a la versió editada.
create or replace function public.reset_approvals_on_edit()
returns trigger language plpgsql as $$
begin
  if new.title           is distinct from old.title
  or new.description     is distinct from old.description
  or new.zone_id          is distinct from old.zone_id
  or new.work_type_id     is distinct from old.work_type_id
  or new.agreed_solution  is distinct from old.agreed_solution
  or new.due_date         is distinct from old.due_date
  or new.assignee_id      is distinct from old.assignee_id
  or new.assignee_team_id is distinct from old.assignee_team_id
  then
    new.approved_responsable_at := null; new.approved_responsable_by := null;
    new.approved_tecnics_at     := null; new.approved_tecnics_by     := null;
    new.approved_propietari_at  := null; new.approved_propietari_by  := null;
  end if;
  return new;
end $$;

drop trigger if exists tickets_reset_approvals_on_solution_change on public.tickets;
drop trigger if exists tickets_reset_approvals_on_edit on public.tickets;
create trigger tickets_reset_approvals_on_edit
  before update on public.tickets
  for each row execute function public.reset_approvals_on_edit();

-- -----------------------------------------------------------------------------
-- Comentaris i imatges
-- -----------------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  bigint not null references public.tickets(id) on delete cascade,
  author_id  uuid   not null references public.profiles(id) on delete cascade default auth.uid(),
  body       text,
  created_at timestamptz not null default now()
);
create index if not exists comments_ticket_idx on public.comments(ticket_id, created_at);

create table if not exists public.comment_images (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid not null references public.comments(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index if not exists comment_images_comment_idx on public.comment_images(comment_id);

-- Imatges adjuntes directament a la descripció o la solució proposada d'una
-- fitxa (a diferència de comment_images, que pengen d'un comentari concret).
create table if not exists public.ticket_field_images (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    bigint not null references public.tickets(id) on delete cascade,
  field        text not null check (field in ('description','agreed_solution')),
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index if not exists ticket_field_images_idx on public.ticket_field_images(ticket_id, field);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Qui veu i comenta una fitxa ho decideix can_comment_ticket(): qui l'edita,
-- qui hi és assignat (persona o equip), o els equips globals de tècnics i
-- propietaris. L'escriptura depèn dels permisos de cada taula.
-- -----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.invitations         enable row level security;
alter table public.invitation_teams    enable row level security;
alter table public.teams               enable row level security;
alter table public.team_members        enable row level security;
alter table public.zones               enable row level security;
alter table public.work_types          enable row level security;
alter table public.tickets             enable row level security;
alter table public.comments            enable row level security;
alter table public.comment_images      enable row level security;
alter table public.ticket_field_images enable row level security;

drop policy if exists profiles_select       on public.profiles;
drop policy if exists profiles_update_self  on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Les invitacions només les veu i les gestiona un administrador. Qui es registra
-- no llegeix la taula: passa per la funció email_is_invited().
drop policy if exists invitations_admin on public.invitations;
create policy invitations_admin on public.invitations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists invitation_teams_admin on public.invitation_teams;
create policy invitation_teams_admin on public.invitation_teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tothom veu els equips (calen per triar assignacions i filtres); només un
-- admin els crea, els renombra o en gestiona els membres.
drop policy if exists teams_select on public.teams;
drop policy if exists teams_write  on public.teams;
create policy teams_select on public.teams
  for select to authenticated using (true);
create policy teams_write on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists team_members_select on public.team_members;
drop policy if exists team_members_write  on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated using (true);
create policy team_members_write on public.team_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists zones_select on public.zones;
drop policy if exists zones_write  on public.zones;
create policy zones_select on public.zones
  for select to authenticated using (true);
create policy zones_write on public.zones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists work_types_select on public.work_types;
drop policy if exists work_types_write  on public.work_types;
create policy work_types_select on public.work_types
  for select to authenticated using (true);
create policy work_types_write on public.work_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated using (public.can_comment_ticket(id));
create policy tickets_insert on public.tickets
  for insert to authenticated with check (public.can_create());
create policy tickets_update on public.tickets
  for update to authenticated
  using (public.can_edit_ticket(id)) with check (public.can_edit_ticket(id));
create policy tickets_delete on public.tickets
  for delete to authenticated using (public.is_admin());

drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_update on public.comments;
drop policy if exists comments_delete on public.comments;
create policy comments_select on public.comments
  for select to authenticated using (public.can_comment_ticket(ticket_id));
create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_comment_ticket(ticket_id));
create policy comments_update on public.comments
  for update to authenticated using (author_id = auth.uid() or public.is_admin());
create policy comments_delete on public.comments
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

drop policy if exists comment_images_select on public.comment_images;
drop policy if exists comment_images_insert on public.comment_images;
drop policy if exists comment_images_delete on public.comment_images;
create policy comment_images_select on public.comment_images
  for select to authenticated using (exists (
    select 1 from public.comments c
    where c.id = comment_id and public.can_comment_ticket(c.ticket_id)));
create policy comment_images_insert on public.comment_images
  for insert to authenticated with check (exists (
    select 1 from public.comments c
    where c.id = comment_id and c.author_id = auth.uid()));
create policy comment_images_delete on public.comment_images
  for delete to authenticated using (exists (
    select 1 from public.comments c
    where c.id = comment_id and (c.author_id = auth.uid() or public.is_admin())));

-- Igual que la resta de la fitxa: qui la pot editar gestiona les imatges de
-- descripció/solució; qui la pot veure/comentar les pot mirar.
drop policy if exists ticket_field_images_select on public.ticket_field_images;
drop policy if exists ticket_field_images_insert on public.ticket_field_images;
drop policy if exists ticket_field_images_delete on public.ticket_field_images;
create policy ticket_field_images_select on public.ticket_field_images
  for select to authenticated using (public.can_comment_ticket(ticket_id));
create policy ticket_field_images_insert on public.ticket_field_images
  for insert to authenticated with check (public.can_edit_ticket(ticket_id));
create policy ticket_field_images_delete on public.ticket_field_images
  for delete to authenticated using (public.can_edit_ticket(ticket_id));

-- -----------------------------------------------------------------------------
-- Vista de llistat (zona, tipus i nombre de comentaris resolts d'un cop)
-- security_invoker: la vista respecta l'RLS de qui consulta.
-- -----------------------------------------------------------------------------
drop view if exists public.ticket_list;
create view public.ticket_list with (security_invoker = on) as
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
  t.due_date,
  t.resolved_at,
  t.assignee_id,
  a.full_name as assignee_name,
  a.email     as assignee_email,
  t.assignee_team_id,
  tm.name     as assignee_team_name,
  t.created_at,
  t.updated_at,
  (select count(*) from public.comments c where c.ticket_id = t.id) as comment_count
from public.tickets t
left join public.zones      z  on z.id  = t.zone_id
left join public.work_types wt on wt.id = t.work_type_id
left join public.profiles   a  on a.id  = t.assignee_id
left join public.teams      tm on tm.id = t.assignee_team_id;

grant select on public.ticket_list to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: imatges dels comentaris i de les fitxes (bucket privat, s'accedeix
-- amb signed URLs). El camí sempre comença per l'id de la fitxa
-- ("{ticket_id}/..."), així que la RLS es pot lligar a can_comment_ticket /
-- can_edit_ticket d'aquella fitxa concreta.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ticket-images','ticket-images', false)
on conflict (id) do nothing;

drop policy if exists ticket_images_select on storage.objects;
drop policy if exists ticket_images_insert on storage.objects;
drop policy if exists ticket_images_delete on storage.objects;
create policy ticket_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'ticket-images'
    and public.can_comment_ticket((split_part(name, '/', 1))::bigint));
create policy ticket_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ticket-images'
    and public.can_comment_ticket((split_part(name, '/', 1))::bigint));
create policy ticket_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'ticket-images' and (
    owner = auth.uid()
    or public.is_admin()
    or public.can_edit_ticket((split_part(name, '/', 1))::bigint)
  ));

-- -----------------------------------------------------------------------------
-- Neteja de l'antic sistema de rol únic. Es fa aquí, al final, perquè cap
-- policy ni trigger de més amunt ja no en depèn (totes s'han substituït per
-- les noves funcions basades en equips i permisos).
-- -----------------------------------------------------------------------------
drop function if exists public.my_role();
drop function if exists public.can_edit();
drop function if exists public.can_comment();
drop function if exists public.guard_profile_role();
drop function if exists public.reset_approvals_on_solution_change();
drop type if exists public.user_role;

-- -----------------------------------------------------------------------------
-- Dades inicials (edita-les des de /admin quan vulguis)
-- -----------------------------------------------------------------------------

-- Llista de zones revisada. Elimina les que ja no s'usen (les fitxes que hi
-- apuntaven queden sense zona, on delete set null); les que es mantenen amb
-- el mateix nom (Habitació 1/2/3, Garatge, Safareig) només actualitzen l'ordre.
delete from public.zones
where name in (
  'Exterior / Façana', 'Coberta', 'Jardí / Parcel·la', 'Planta baixa',
  'Planta primera', 'Escala', 'Cuina', 'Menjador - Sala', 'Bany 1',
  'Bany 2', 'Instal·lacions', 'Altres'
);

insert into public.zones (name, sort_order) values
  ('Tanca',                 10),
  ('Jardí',                 20),
  ('Façana',                30),
  ('Rebedor',               40),
  ('Escales',               50),
  ('Sala-Cuina-Menjador',   60),
  ('Passadís PB',           70),
  ('Bany cortesia',         80),
  ('Bany PB',               90),
  ('Bany suite',           100),
  ('Bany comú',            110),
  ('Habitació 1',          120),
  ('Habitació 2',          130),
  ('Habitació 3',          140),
  ('Despatx 1',            150),
  ('Despatx 2',            160),
  ('Garatge',              170),
  ('Traster',              180),
  ('Traster P1',           190),
  ('Safareig',             200),
  ('Sala P1',              210),
  ('Terrassa P1',          220),
  ('Piscina',              230),
  ('Terrassa jardí',       240),
  ('Sala màquines',        250),
  ('Passadís P1',          260)
on conflict (name) do update set sort_order = excluded.sort_order;

insert into public.work_types (name, sort_order) values
  ('Pintura',                        10),
  ('Finestres',                      20),
  ('Fusteria',                       30),
  ('Electricitat',                   40),
  ('Fontaneria',                     50),
  ('Clima / Ventilació',             60),
  ('Paviment',                       70),
  ('Revestiments / Enrajolat',       80),
  ('Sanejament',                      90),
  ('Estructura',                     100),
  ('Aïllament / Impermeabilització', 110),
  ('Mobiliari',                      120),
  ('Remats i neteja',                130),
  ('Documentació / Legalitzacions',  140),
  ('Altres',                         999)
on conflict (name) do nothing;
