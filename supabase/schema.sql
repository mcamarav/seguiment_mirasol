-- =============================================================================
-- Seguiment d'obres — esquema complet de Supabase (versió multiprojecte)
--
-- Executa aquest fitxer sencer a l'SQL Editor d'un projecte de Supabase NOU.
-- És la versió multiprojecte: totes les dades (fitxes, zones, tipus, equips)
-- pengen d'un projecte (`public.projects`) i cada persona té accés — o no — a
-- cada projecte per separat, amb els seus permisos i els seus equips dins de
-- cada un.
--
-- Diferències respecte de la versió d'un sol projecte:
--   · profiles només guarda `is_admin` (administrador de la instal·lació).
--     Els permisos de fitxes (crear, editar-ho tot) són per projecte i viuen a
--     `project_members`.
--   · teams, zones, work_types i tickets porten `project_id`.
--   · les fitxes es numeren per projecte (`tickets.ref`): #001 de cada obra.
--   · qui no és membre d'un projecte no en veu absolutament res (RLS).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Perfils
--
-- `is_admin` és l'únic permís global que queda: l'administrador de la
-- instal·lació. Ho pot fer tot a tots els projectes, crea projectes, convida
-- gent i reparteix accessos. Tota la resta de permisos són per projecte.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Administrador de la instal·lació. SECURITY DEFINER per evitar recursió d'RLS.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- -----------------------------------------------------------------------------
-- Projectes (les obres que es fan servir)
--
-- El `slug` és el que surt a la URL: /p/mirasol. Amagar un projecte
-- (active = false) el treu del selector sense esborrar-ne res. La foto de
-- portada (`image_path`) és opcional i viu al bucket `project-images`.
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id         bigint generated always as identity primary key,
  slug       text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  name       text not null,
  -- Foto de portada, per reconèixer l'obra d'un cop d'ull al selector. És el
  -- camí dins del bucket `project-images`; null vol dir que no en té.
  image_path text,
  active     boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Accés als projectes
--
-- Una fila per persona i projecte: si no hi ha fila, no hi té accés i no en veu
-- res. Els permisos són els que abans eren globals, ara per projecte:
--   is_manager   -> administra aquest projecte (membres, equips, zones i tipus),
--                   i pot aprovar en nom de qualsevol actor dins d'ell
--   can_create   -> pot crear fitxes noves en aquest projecte
--   can_edit_all -> pot editar qualsevol fitxa del projecte (no només les seves)
-- Qui crea una fitxa sempre la pot editar, encara que no tingui can_edit_all.
-- -----------------------------------------------------------------------------
create table if not exists public.project_members (
  project_id   bigint  not null references public.projects(id) on delete cascade,
  user_id      uuid    not null references public.profiles(id) on delete cascade,
  is_manager   boolean not null default false,
  can_create   boolean not null default false,
  can_edit_all boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on public.project_members(user_id);

-- Helpers de permisos per projecte. Tots donen per bo l'administrador de la
-- instal·lació, així no cal repetir-ho a cada policy.
create or replace function public.is_project_member(p_project_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_manager(p_project_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id and m.user_id = auth.uid() and m.is_manager
  );
$$;

create or replace function public.can_create_in(p_project_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id and m.user_id = auth.uid()
      and (m.is_manager or m.can_create)
  );
$$;

create or replace function public.can_edit_all_in(p_project_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id and m.user_id = auth.uid()
      and (m.is_manager or m.can_edit_all)
  );
$$;

-- Comparteixen algun projecte? És el que decideix quins perfils es veuen: la
-- llista de gent no ha de sortir del projecte.
create or replace function public.shares_project(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.project_members mine
      join public.project_members other on other.project_id = mine.project_id
     where mine.user_id = auth.uid() and other.user_id = p_user_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Equips: grups d'usuaris DINS d'un projecte (els gestiona qui l'administra).
-- Una persona pot pertànyer a diversos equips del mateix projecte i tenir
-- equips diferents a cada projecte.
--
-- Un equip pot tenir un "rol global" dins del seu projecte (tecnics /
-- propietaris): els seus membres aproven la casella corresponent i veuen i
-- comenten TOTES les fitxes d'aquell projecte, no només les assignades. Com a
-- molt un equip per projecte pot tenir cada rol global.
--
-- La casella "Responsable" no té equip fix: l'aprova qui tingui la fitxa
-- assignada (assignee_id / assignee_team_id).
-- -----------------------------------------------------------------------------
create table if not exists public.teams (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects(id) on delete cascade,
  name        text not null,
  global_role text check (global_role in ('tecnics','propietaris')),
  created_at  timestamptz not null default now(),
  unique (project_id, name)
);
create unique index if not exists teams_project_global_role_unique
  on public.teams(project_id, global_role) where global_role is not null;

create table if not exists public.team_members (
  team_id    bigint not null references public.teams(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members(user_id);

-- Membre de l'equip amb aquest rol global en aquest projecte.
create or replace function public.is_global_team_member(p_project_id bigint, p_global_role text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = auth.uid()
      and t.project_id = p_project_id
      and t.global_role = p_global_role
  );
$$;

-- -----------------------------------------------------------------------------
-- Convidats: NOMÉS es pot registrar qui tingui el correu autoritzat aquí.
-- La invitació és a la instal·lació, i pot portar pre-assignats els projectes
-- (amb els permisos de cada un) i els equips que se li donaran en registrar-se.
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

-- Projectes (i permisos dins de cada un) que se li donaran quan la invitació
-- s'accepti. Es pot editar mentre estigui pendent; un cop acceptada,
-- handle_new_user() converteix aquestes files en project_members i les esborra.
create table if not exists public.invitation_projects (
  email        text    not null references public.invitations(email) on delete cascade,
  project_id   bigint  not null references public.projects(id) on delete cascade,
  is_manager   boolean not null default false,
  can_create   boolean not null default false,
  can_edit_all boolean not null default false,
  primary key (email, project_id)
);

-- Equips pre-assignats (ja porten projecte, perquè els equips en tenen un).
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
-- queda cap usuari a mitges. En acceptar-la, la persona es queda amb els
-- projectes i els equips que se li havien pre-assignat.
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

  insert into public.project_members (project_id, user_id, is_manager, can_create, can_edit_all)
  select ip.project_id, new.id, ip.is_manager, ip.can_create, ip.can_edit_all
    from public.invitation_projects ip
   where ip.email = inv.email
  on conflict do nothing;

  -- Els equips pre-assignats només valen si la persona acaba tenint accés al
  -- projecte de l'equip: si no, l'equip no li serviria de res.
  insert into public.team_members (team_id, user_id)
  select it.team_id, new.id
    from public.invitation_teams it
    join public.teams t on t.id = it.team_id
    join public.project_members m on m.project_id = t.project_id and m.user_id = new.id
   where it.email = inv.email
  on conflict do nothing;

  delete from public.invitation_projects where email = inv.email;
  delete from public.invitation_teams    where email = inv.email;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ningú que no sigui administrador de la instal·lació pot fer-se administrador.
create or replace function public.guard_profile_capabilities()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'Només un administrador pot canviar els permisos d''un usuari';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_capabilities on public.profiles;
create trigger profiles_guard_capabilities
  before update on public.profiles
  for each row execute function public.guard_profile_capabilities();

-- Els membres d'un equip han de tenir accés al projecte de l'equip: si no, hi
-- serien sense poder veure'n cap fitxa.
create or replace function public.check_team_member_project()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p_id bigint;
begin
  select project_id into p_id from public.teams where id = new.team_id;
  if not exists (
    select 1 from public.project_members m
    where m.project_id = p_id and m.user_id = new.user_id
  ) then
    raise exception 'Aquesta persona no té accés al projecte de l''equip';
  end if;
  return new;
end $$;

drop trigger if exists team_members_check_project on public.team_members;
create trigger team_members_check_project
  before insert or update on public.team_members
  for each row execute function public.check_team_member_project();

-- Treure algú d'un projecte també l'ha de treure dels equips d'aquell projecte.
create or replace function public.clean_team_memberships()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_members tm
   using public.teams t
   where tm.team_id = t.id
     and t.project_id = old.project_id
     and tm.user_id = old.user_id;
  return old;
end $$;

drop trigger if exists project_members_clean_teams on public.project_members;
create trigger project_members_clean_teams
  after delete on public.project_members
  for each row execute function public.clean_team_memberships();

-- -----------------------------------------------------------------------------
-- Zones i tipus de treball (classificació: "Habitació 1 · Pintura")
-- Cada projecte té les seves llistes: els noms només han de ser únics dins
-- del projecte.
-- -----------------------------------------------------------------------------
create table if not exists public.zones (
  id         bigint generated always as identity primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 100,
  active     boolean not null default true,
  unique (project_id, name)
);

create table if not exists public.work_types (
  id         bigint generated always as identity primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 100,
  active     boolean not null default true,
  unique (project_id, name)
);

-- -----------------------------------------------------------------------------
-- Fitxes (tickets)
--
-- `project_id` diu de quina obra és i no es pot canviar mai (moure una fitxa de
-- projecte deixaria zones, tipus, equips i permisos sense sentit).
--
-- `id` és únic a tota la base de dades (és el que fa servir Storage per als
-- camins de les imatges), i `ref` és el número que es mostra: #001, #002…
-- comptats dins de cada projecte.
--
-- L'estat és una columna generada, no s'edita a mà:
--   resolt            -> les 3 aprovacions fetes
--   a_revisar         -> el responsable ha marcat OK però el tècnic o el
--                        propietari han demanat revisió (review_*_at)
--   solucio_acordada  -> hi ha una solució proposada (agreed_solution) escrita
--   obert             -> la resta
-- Qualsevol edició d'una fitxa reinicia les 3 aprovacions i les peticions de
-- revisió (trigger reset_approvals_on_edit): cal tornar a passar el circuit
-- sencer per a la versió nova.
--
-- Aquest estat és el gruixut, el que fan servir els filtres i les pestanyes.
-- L'estat que es mostra a l'usuari és més detallat (executat, pendent
-- aprovació tècnic, pendent aprovació propietari…) i es deriva de les tres
-- dates d'aprovació a l'aplicació: vegeu src/lib/status.ts.
-- -----------------------------------------------------------------------------
create table if not exists public.tickets (
  id                       bigint generated always as identity primary key,
  project_id               bigint not null references public.projects(id) on delete cascade,
  ref                      int,
  title                    text not null,
  description              text,
  zone_id                  bigint references public.zones(id) on delete set null,
  work_type_id             bigint references public.work_types(id) on delete set null,
  agreed_solution          text,
  due_date                 date,
  assignee_id              uuid   references public.profiles(id) on delete set null,
  assignee_team_id         bigint references public.teams(id) on delete set null,
  approved_responsable_at  timestamptz,
  approved_responsable_by  uuid references public.profiles(id) on delete set null,
  approved_tecnics_at      timestamptz,
  approved_tecnics_by      uuid references public.profiles(id) on delete set null,
  approved_propietari_at   timestamptz,
  approved_propietari_by   uuid references public.profiles(id) on delete set null,
  -- Petició de revisió: el tècnic o el propietari diuen que allò que el
  -- responsable ha marcat com a fet no els fa el pes. És excloent amb la seva
  -- pròpia aprovació (vegeu els checks de més avall).
  review_tecnics_at        timestamptz,
  review_tecnics_by        uuid references public.profiles(id) on delete set null,
  review_propietari_at     timestamptz,
  review_propietari_by     uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text generated always as (
    case
      when approved_responsable_at is not null
       and approved_tecnics_at     is not null
       and approved_propietari_at  is not null then 'resolt'
      when approved_responsable_at is not null
       and (review_tecnics_at is not null or review_propietari_at is not null)
        then 'a_revisar'
      when agreed_solution is not null and btrim(agreed_solution) <> ''
        then 'solucio_acordada'
      else 'obert'
    end
  ) stored,
  -- Data de resolució: automàtica, la data de l'última de les 3 aprovacions
  -- (no es pot desquadrar amb l'estat perquè es calcula igual que ell).
  resolved_at timestamptz generated always as (
    case
      when approved_responsable_at is not null
       and approved_tecnics_at     is not null
       and approved_propietari_at  is not null
        then greatest(approved_responsable_at, approved_tecnics_at, approved_propietari_at)
      else null
    end
  ) stored,
  constraint tickets_assignee_single_check
    check (not (assignee_id is not null and assignee_team_id is not null)),
  -- Per a cada actor, aprovar i demanar revisió són excloents; i no es pot
  -- demanar revisió si el responsable encara no ha marcat la feina com a feta.
  constraint tickets_tecnics_review_check
    check (not (approved_tecnics_at is not null and review_tecnics_at is not null)),
  constraint tickets_propietari_review_check
    check (not (approved_propietari_at is not null and review_propietari_at is not null)),
  constraint tickets_review_needs_responsable_check
    check (approved_responsable_at is not null
       or (review_tecnics_at is null and review_propietari_at is null))
);

create unique index if not exists tickets_project_ref_unique on public.tickets(project_id, ref);
create index if not exists tickets_project_idx       on public.tickets(project_id);
create index if not exists tickets_status_idx        on public.tickets(project_id, status);
create index if not exists tickets_zone_idx          on public.tickets(zone_id);
create index if not exists tickets_work_type_idx     on public.tickets(work_type_id);
create index if not exists tickets_assignee_idx      on public.tickets(assignee_id);
create index if not exists tickets_assignee_team_idx on public.tickets(assignee_team_id);
create index if not exists tickets_due_date_idx      on public.tickets(due_date);

-- Número de fitxa dins del projecte. El pany d'advisory lock serialitza les
-- insercions del mateix projecte: dues fitxes creades alhora no poden agafar
-- el mateix número.
create or replace function public.assign_ticket_ref()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ref is null then
    perform pg_advisory_xact_lock(new.project_id);
    select coalesce(max(ref), 0) + 1 into new.ref
      from public.tickets where project_id = new.project_id;
  end if;
  return new;
end $$;

drop trigger if exists tickets_assign_ref on public.tickets;
create trigger tickets_assign_ref
  before insert on public.tickets
  for each row execute function public.assign_ticket_ref();

-- Tot el que penja d'una fitxa ha de ser del mateix projecte: la zona, el
-- tipus, l'equip assignat i la persona assignada (que ha de tenir-hi accés).
-- Així una fitxa no pot acabar apuntant a dades d'una altra obra ni assignada
-- a algú que no la pot ni veure.
create or replace function public.check_ticket_project()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'Una fitxa no es pot moure de projecte';
  end if;

  if new.zone_id is not null and not exists (
    select 1 from public.zones z where z.id = new.zone_id and z.project_id = new.project_id
  ) then
    raise exception 'La zona no és d''aquest projecte';
  end if;

  if new.work_type_id is not null and not exists (
    select 1 from public.work_types w
     where w.id = new.work_type_id and w.project_id = new.project_id
  ) then
    raise exception 'El tipus no és d''aquest projecte';
  end if;

  if new.assignee_team_id is not null and not exists (
    select 1 from public.teams t
     where t.id = new.assignee_team_id and t.project_id = new.project_id
  ) then
    raise exception 'L''equip no és d''aquest projecte';
  end if;

  if new.assignee_id is not null and not exists (
    select 1 from public.project_members m
     where m.project_id = new.project_id and m.user_id = new.assignee_id
  ) then
    raise exception 'Aquesta persona no té accés al projecte';
  end if;

  return new;
end $$;

drop trigger if exists tickets_check_project on public.tickets;
create trigger tickets_check_project
  before insert or update on public.tickets
  for each row execute function public.check_ticket_project();

-- -----------------------------------------------------------------------------
-- Qui pot què, fitxa per fitxa
--
--   can_view_ticket    tenir accés al projecte de la fitxa. Un membre sense cap
--                      permís ni equip és, de fet, un lector del projecte.
--   can_edit_ticket    qui l'ha creada, qui té can_edit_all al projecte, qui
--                      l'administra, i l'administrador de la instal·lació.
--   can_comment_ticket qui la pot editar, qui hi és assignat (persona o equip) i
--                      els equips globals de tècnics i propietaris del projecte.
-- -----------------------------------------------------------------------------
create or replace function public.can_view_ticket(p_ticket_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.is_project_member(t.project_id)
    from public.tickets t where t.id = p_ticket_id
  ), false);
$$;

create or replace function public.can_edit_ticket(p_ticket_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.can_edit_all_in(t.project_id)
        or (t.created_by = auth.uid() and public.is_project_member(t.project_id))
    from public.tickets t where t.id = p_ticket_id
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

create or replace function public.can_comment_ticket(p_ticket_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.can_edit_ticket(p_ticket_id)
        or (public.is_project_member(t.project_id) and (
              public.is_assigned_to_ticket(p_ticket_id)
           or public.is_global_team_member(t.project_id, 'tecnics')
           or public.is_global_team_member(t.project_id, 'propietaris')))
    from public.tickets t where t.id = p_ticket_id
  ), false);
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

-- Cada casella d'aprovació la pot marcar només qui té dret a fer-ho dins del
-- projecte de la fitxa. El trigger també segella qui ha aprovat i quan.
--   Responsable -> qui té la fitxa assignada (persona o equip)
--   Tècnics     -> qualsevol membre de l'equip del projecte amb rol 'tecnics'
--   Propietari  -> qualsevol membre de l'equip del projecte amb rol 'propietaris'
-- Qui administra el projecte (i l'administrador de la instal·lació) pot aprovar
-- en nom de qualsevol actor.
-- El responsable, a més, pot *esborrar* l'aprovació i la petició de revisió del
-- tècnic i del propietari: és el que fa quan torna a marcar la feina com a feta
-- («Revisat»), que reinicia el circuit d'aprovacions.
create or replace function public.guard_ticket_approvals()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  manager     boolean;
  responsable boolean;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid()) then
    raise exception 'No s''ha trobat el perfil de l''usuari';
  end if;

  -- La policy d'UPDATE deixa entrar tothom qui pot aprovar, que no és el mateix
  -- que poder editar: qui només aprova no pot tocar cap altre camp.
  if not public.can_edit_ticket(new.id) then
    if new.title           is distinct from old.title
    or new.description      is distinct from old.description
    or new.zone_id          is distinct from old.zone_id
    or new.work_type_id     is distinct from old.work_type_id
    or new.agreed_solution  is distinct from old.agreed_solution
    or new.due_date         is distinct from old.due_date
    or new.assignee_id      is distinct from old.assignee_id
    or new.assignee_team_id is distinct from old.assignee_team_id
    or new.ref              is distinct from old.ref
    or new.created_by       is distinct from old.created_by
    or new.created_at       is distinct from old.created_at
    then
      raise exception 'No tens permís per editar aquesta fitxa: només pots marcar les teves aprovacions';
    end if;
  end if;

  manager := public.is_project_manager(old.project_id);

  responsable := manager or old.assignee_id = auth.uid()
    or (old.assignee_team_id is not null and exists (
          select 1 from public.team_members
          where team_id = old.assignee_team_id and user_id = auth.uid()));

  if new.approved_responsable_at is distinct from old.approved_responsable_at then
    if not responsable then
      raise exception 'Només qui té la fitxa assignada (o qui administra el projecte) pot canviar aquesta aprovació';
    end if;
    new.approved_responsable_by :=
      case when new.approved_responsable_at is null then null else auth.uid() end;
  end if;

  if new.approved_tecnics_at is distinct from old.approved_tecnics_at then
    if not manager and not public.is_global_team_member(old.project_id, 'tecnics')
       and not (new.approved_tecnics_at is null and responsable) then
      raise exception 'Només algú de l''equip de tècnics del projecte pot canviar aquesta aprovació';
    end if;
    new.approved_tecnics_by :=
      case when new.approved_tecnics_at is null then null else auth.uid() end;
  end if;

  if new.approved_propietari_at is distinct from old.approved_propietari_at then
    if not manager and not public.is_global_team_member(old.project_id, 'propietaris')
       and not (new.approved_propietari_at is null and responsable) then
      raise exception 'Només algú de l''equip de propietaris del projecte pot canviar aquesta aprovació';
    end if;
    new.approved_propietari_by :=
      case when new.approved_propietari_at is null then null else auth.uid() end;
  end if;

  -- Peticions de revisió: les demana l'actor mateix; les pot retirar ell o el
  -- responsable (quan torna a marcar la fitxa com a feta).
  if new.review_tecnics_at is distinct from old.review_tecnics_at then
    if not manager and not public.is_global_team_member(old.project_id, 'tecnics')
       and not (new.review_tecnics_at is null and responsable) then
      raise exception 'Només algú de l''equip de tècnics del projecte pot demanar la revisió';
    end if;
    new.review_tecnics_by :=
      case when new.review_tecnics_at is null then null else auth.uid() end;
  end if;

  if new.review_propietari_at is distinct from old.review_propietari_at then
    if not manager and not public.is_global_team_member(old.project_id, 'propietaris')
       and not (new.review_propietari_at is null and responsable) then
      raise exception 'Només algú de l''equip de propietaris del projecte pot demanar la revisió';
    end if;
    new.review_propietari_by :=
      case when new.review_propietari_at is null then null else auth.uid() end;
  end if;

  return new;
end $$;

drop trigger if exists tickets_guard_approvals on public.tickets;
create trigger tickets_guard_approvals
  before update on public.tickets
  for each row execute function public.guard_ticket_approvals();

-- Editar qualsevol camp de la fitxa (títol, descripció, zona, tipus, solució
-- proposada, data prevista o assignació) reinicia les 3 aprovacions i les
-- peticions de revisió: cal tornar a passar el circuit per a la versió editada.
create or replace function public.reset_approvals_on_edit()
returns trigger language plpgsql as $$
begin
  if new.title           is distinct from old.title
  or new.description      is distinct from old.description
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
    new.review_tecnics_at       := null; new.review_tecnics_by       := null;
    new.review_propietari_at    := null; new.review_propietari_by    := null;
  end if;
  return new;
end $$;

drop trigger if exists tickets_reset_approvals_on_edit on public.tickets;
create trigger tickets_reset_approvals_on_edit
  before update on public.tickets
  for each row execute function public.reset_approvals_on_edit();

-- -----------------------------------------------------------------------------
-- Comentaris i imatges (pengen de la fitxa, i per tant del seu projecte)
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
--
-- La frontera de tot és el projecte: qui no hi és membre no veu ni les fitxes,
-- ni les zones, ni els equips, ni tan sols els perfils de la gent que hi
-- treballa. Dins del projecte, qui pot editar i comentar cada fitxa el
-- decideixen can_edit_ticket() i can_comment_ticket().
-- -----------------------------------------------------------------------------
create or replace function public.ticket_project(p_ticket_id bigint)
returns bigint
language sql stable security definer set search_path = public as $$
  select project_id from public.tickets where id = p_ticket_id;
$$;

alter table public.profiles            enable row level security;
alter table public.projects            enable row level security;
alter table public.project_members     enable row level security;
alter table public.invitations         enable row level security;
alter table public.invitation_projects enable row level security;
alter table public.invitation_teams    enable row level security;
alter table public.teams               enable row level security;
alter table public.team_members        enable row level security;
alter table public.zones               enable row level security;
alter table public.work_types          enable row level security;
alter table public.tickets             enable row level security;
alter table public.comments            enable row level security;
alter table public.comment_images      enable row level security;
alter table public.ticket_field_images enable row level security;

-- Perfils: el propi, i els de la gent amb qui es comparteix algun projecte.
drop policy if exists profiles_select       on public.profiles;
drop policy if exists profiles_update_self  on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_project(id));
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Projectes: només els que et pertoquen. Els crea i els esborra l'administrador
-- de la instal·lació; el nom el pot canviar qui l'administra.
drop policy if exists projects_select on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (public.is_project_member(id));
create policy projects_insert on public.projects
  for insert to authenticated with check (public.is_admin());
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_project_manager(id)) with check (public.is_project_manager(id));
create policy projects_delete on public.projects
  for delete to authenticated using (public.is_admin());

-- Accessos: els membres del projecte veuen qui més hi és (cal per assignar
-- fitxes); els reparteix qui administra el projecte.
drop policy if exists project_members_select on public.project_members;
drop policy if exists project_members_write  on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated using (public.is_project_member(project_id));
create policy project_members_write on public.project_members
  for all to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

-- Les invitacions només les veu i les gestiona un administrador. Qui es registra
-- no llegeix la taula: passa per la funció email_is_invited().
drop policy if exists invitations_admin on public.invitations;
create policy invitations_admin on public.invitations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists invitation_projects_admin on public.invitation_projects;
create policy invitation_projects_admin on public.invitation_projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists invitation_teams_admin on public.invitation_teams;
create policy invitation_teams_admin on public.invitation_teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Equips: es veuen des de dins del projecte, i els gestiona qui l'administra.
drop policy if exists teams_select on public.teams;
drop policy if exists teams_write  on public.teams;
create policy teams_select on public.teams
  for select to authenticated using (public.is_project_member(project_id));
create policy teams_write on public.teams
  for all to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

drop policy if exists team_members_select on public.team_members;
drop policy if exists team_members_write  on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated using (exists (
    select 1 from public.teams t
    where t.id = team_id and public.is_project_member(t.project_id)));
create policy team_members_write on public.team_members
  for all to authenticated
  using (exists (
    select 1 from public.teams t
    where t.id = team_id and public.is_project_manager(t.project_id)))
  with check (exists (
    select 1 from public.teams t
    where t.id = team_id and public.is_project_manager(t.project_id)));

drop policy if exists zones_select on public.zones;
drop policy if exists zones_write  on public.zones;
create policy zones_select on public.zones
  for select to authenticated using (public.is_project_member(project_id));
create policy zones_write on public.zones
  for all to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

drop policy if exists work_types_select on public.work_types;
drop policy if exists work_types_write  on public.work_types;
create policy work_types_select on public.work_types
  for select to authenticated using (public.is_project_member(project_id));
create policy work_types_write on public.work_types
  for all to authenticated
  using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

-- Fitxes: les veu tot membre del projecte; les crea qui hi té permís de crear;
-- les edita qui la pot editar; les esborra qui administra el projecte.
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated using (public.is_project_member(project_id));
create policy tickets_insert on public.tickets
  for insert to authenticated with check (public.can_create_in(project_id));
-- L'UPDATE l'ha de poder fer també qui només aprova (el responsable assignat,
-- els equips globals): si la policy exigís can_edit_ticket, marcar una casella
-- no afectaria cap fila i l'aprovació fallaria en silenci. Que no pugui canviar
-- res més que les aprovacions ho garanteix el trigger guard_ticket_approvals.
create policy tickets_update on public.tickets
  for update to authenticated
  using (public.can_comment_ticket(id)) with check (public.can_comment_ticket(id));
create policy tickets_delete on public.tickets
  for delete to authenticated using (public.is_project_manager(project_id));

drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_update on public.comments;
drop policy if exists comments_delete on public.comments;
create policy comments_select on public.comments
  for select to authenticated using (public.can_view_ticket(ticket_id));
create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_comment_ticket(ticket_id));
create policy comments_update on public.comments
  for update to authenticated
  using (author_id = auth.uid()
     or public.is_project_manager(public.ticket_project(ticket_id)));
create policy comments_delete on public.comments
  for delete to authenticated
  using (author_id = auth.uid()
     or public.is_project_manager(public.ticket_project(ticket_id)));

drop policy if exists comment_images_select on public.comment_images;
drop policy if exists comment_images_insert on public.comment_images;
drop policy if exists comment_images_delete on public.comment_images;
create policy comment_images_select on public.comment_images
  for select to authenticated using (exists (
    select 1 from public.comments c
    where c.id = comment_id and public.can_view_ticket(c.ticket_id)));
create policy comment_images_insert on public.comment_images
  for insert to authenticated with check (exists (
    select 1 from public.comments c
    where c.id = comment_id and c.author_id = auth.uid()));
create policy comment_images_delete on public.comment_images
  for delete to authenticated using (exists (
    select 1 from public.comments c
    where c.id = comment_id and (
      c.author_id = auth.uid()
      or public.is_project_manager(public.ticket_project(c.ticket_id)))));

-- Igual que la resta de la fitxa: qui la pot editar gestiona les imatges de
-- descripció/solució; qui és del projecte les pot mirar.
drop policy if exists ticket_field_images_select on public.ticket_field_images;
drop policy if exists ticket_field_images_insert on public.ticket_field_images;
drop policy if exists ticket_field_images_delete on public.ticket_field_images;
create policy ticket_field_images_select on public.ticket_field_images
  for select to authenticated using (public.can_view_ticket(ticket_id));
create policy ticket_field_images_insert on public.ticket_field_images
  for insert to authenticated with check (public.can_edit_ticket(ticket_id));
create policy ticket_field_images_delete on public.ticket_field_images
  for delete to authenticated using (public.can_edit_ticket(ticket_id));

-- -----------------------------------------------------------------------------
-- Vista de llistat (projecte, zona, tipus i nombre de comentaris d'un cop)
-- security_invoker: la vista respecta l'RLS de qui consulta.
-- -----------------------------------------------------------------------------
drop view if exists public.ticket_list;
create view public.ticket_list with (security_invoker = on) as
select
  t.id,
  t.project_id,
  pr.slug as project_slug,
  t.ref,
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
  (select count(*) from public.comments c where c.ticket_id = t.id) as comment_count
from public.tickets t
join public.projects        pr on pr.id = t.project_id
left join public.zones      z  on z.id  = t.zone_id
left join public.work_types wt on wt.id = t.work_type_id
left join public.profiles   a  on a.id  = t.assignee_id
left join public.teams      tm on tm.id = t.assignee_team_id;

grant select on public.ticket_list to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: imatges dels comentaris i de les fitxes (bucket privat, s'accedeix
-- amb signed URLs). El camí sempre comença per l'id GLOBAL de la fitxa
-- ("{ticket_id}/..."), no pel número que es mostra, així que la RLS es pot
-- lligar a les funcions de permisos d'aquella fitxa concreta i el projecte hi
-- queda inclòs.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ticket-images','ticket-images', false)
on conflict (id) do nothing;

drop policy if exists ticket_images_select on storage.objects;
drop policy if exists ticket_images_insert on storage.objects;
drop policy if exists ticket_images_delete on storage.objects;
create policy ticket_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'ticket-images' and name ~ '^[0-9]+/'
    and public.can_view_ticket((split_part(name, '/', 1))::bigint));
create policy ticket_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ticket-images' and name ~ '^[0-9]+/'
    and public.can_comment_ticket((split_part(name, '/', 1))::bigint));
create policy ticket_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'ticket-images' and name ~ '^[0-9]+/' and (
    owner = auth.uid()
    or public.can_edit_ticket((split_part(name, '/', 1))::bigint)
  ));

-- -----------------------------------------------------------------------------
-- Storage: foto de portada dels projectes (mateix bucket privat per a tots, un
-- fitxer per projecte). El camí comença per l'id del projecte
-- ("{project_id}/..."), així la RLS sap de quin projecte és cada fitxer: la
-- veu qui hi té accés i només la canvia qui l'administra.
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- Dades inicials
--
-- Les llistes de zones i tipus que rep cada projecte nou. Viuen en una funció
-- perquè les pugui sembrar l'app en crear un projecte, i el seed d'aquí sota
-- en crear el primer, sense duplicar-les.
--
-- La versió `_unchecked` no comprova permisos i per això no es pot cridar des
-- de l'app (es revoca l'execute); el que fa servir l'app és
-- seed_project_catalogs(), que exigeix administrar el projecte.
-- -----------------------------------------------------------------------------
create or replace function public.seed_project_catalogs_unchecked(p_project_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.zones (project_id, name, sort_order)
  select p_project_id, v.name, v.sort_order
    from (values
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
    ) as v(name, sort_order)
  on conflict (project_id, name) do nothing;

  insert into public.work_types (project_id, name, sort_order)
  select p_project_id, v.name, v.sort_order
    from (values
      ('Pintura',                        10),
      ('Finestres',                      20),
      ('Fusteria',                       30),
      ('Electricitat',                   40),
      ('Fontaneria',                     50),
      ('Clima / Ventilació',             60),
      ('Paviment',                       70),
      ('Revestiments / Enrajolat',       80),
      ('Sanejament',                     90),
      ('Estructura',                    100),
      ('Aïllament / Impermeabilització', 110),
      ('Mobiliari',                     120),
      ('Remats i neteja',               130),
      ('Documentació / Legalitzacions', 140),
      ('Altres',                        999)
    ) as v(name, sort_order)
  on conflict (project_id, name) do nothing;
end $$;

revoke all on function public.seed_project_catalogs_unchecked(bigint) from public;
revoke all on function public.seed_project_catalogs_unchecked(bigint) from anon, authenticated;

create or replace function public.seed_project_catalogs(p_project_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_project_manager(p_project_id) then
    raise exception 'Només qui administra el projecte pot sembrar-ne les llistes';
  end if;
  perform public.seed_project_catalogs_unchecked(p_project_id);
end $$;

grant execute on function public.seed_project_catalogs(bigint) to authenticated;

-- El primer projecte, per no arrencar amb la pantalla buida. Els següents es
-- creen des de /admin i neixen amb una còpia d'aquestes mateixes llistes.
insert into public.projects (slug, name) values ('mirasol', 'Mirasol')
on conflict (slug) do nothing;

do $$
begin
  perform public.seed_project_catalogs_unchecked(
    (select id from public.projects where slug = 'mirasol'));
end $$;
