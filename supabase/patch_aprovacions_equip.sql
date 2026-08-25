-- Pedaç: deixa aprovar qui té la fitxa assignada per equip.
--
-- La policy tickets_update només acceptava can_edit_ticket (admin, can_edit_all
-- o autor de la fitxa), així que l'UPDATE d'una aprovació feta per un
-- responsable que hi arriba per equip no afectava cap fila — i l'RLS no dóna
-- error en aquest cas, de manera que el botó semblava funcionar sense fer res.
--
-- És el subconjunt de supabase/schema.sql que canvia, per no haver de
-- reexecutar el fitxer sencer (que al final recrea els catàlegs de zones i
-- tipus de feina). Executa'l sencer al SQL Editor de Supabase.

begin;

-- Pot tocar ALGUNA casella d'aprovació o de revisió de la fitxa: qui la té
-- assignada (responsable), l'equip global de tècnics, el de propietaris, o un
-- admin. És el permís que obre l'UPDATE de la fila; quina columna concreta pot
-- canviar cadascú ho decideix el trigger guard_ticket_approvals.
create or replace function public.can_approve_ticket(p_ticket_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.is_assigned_to_ticket(p_ticket_id)
      or public.is_global_team_member('tecnics')
      or public.is_global_team_member('propietaris');
$$;

-- Cada casella d'aprovació la pot marcar només qui té dret a fer-ho (o un
-- admin). El trigger també segella qui ha aprovat i quan.
--   Responsable -> qui té la fitxa assignada (persona o equip)
--   Tècnics     -> qualsevol membre de l'equip amb rol global 'tecnics'
--   Propietari  -> qualsevol membre de l'equip amb rol global 'propietaris'
-- El responsable, a més, pot *esborrar* l'aprovació i la petició de revisió del
-- tècnic i del propietari: és el que fa quan torna a marcar la feina com a feta
-- («Revisat»), que reinicia el circuit d'aprovacions.
create or replace function public.guard_ticket_approvals()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  admin       boolean;
  responsable boolean;
begin
  select p.is_admin into admin from public.profiles p where p.id = auth.uid();
  if admin is null then
    raise exception 'No s''ha trobat el perfil de l''usuari';
  end if;

  responsable := admin or old.assignee_id = auth.uid()
    or (old.assignee_team_id is not null and exists (
          select 1 from public.team_members
          where team_id = old.assignee_team_id and user_id = auth.uid()));

  -- La policy tickets_update deixa entrar aquí qui només pot aprovar (l'RLS no
  -- sap de columnes), així que els camps de contingut els tanca el trigger:
  -- tocar-los només ho pot fer qui pot editar la fitxa.
  if not public.can_edit_ticket(old.id) and (
       new.title            is distinct from old.title
    or new.description      is distinct from old.description
    or new.zone_id          is distinct from old.zone_id
    or new.work_type_id     is distinct from old.work_type_id
    or new.agreed_solution  is distinct from old.agreed_solution
    or new.due_date         is distinct from old.due_date
    or new.assignee_id      is distinct from old.assignee_id
    or new.assignee_team_id is distinct from old.assignee_team_id
    or new.created_by       is distinct from old.created_by
  ) then
    raise exception 'No tens permís per editar aquesta fitxa';
  end if;

  if new.approved_responsable_at is distinct from old.approved_responsable_at then
    if not responsable then
      raise exception 'Només qui té la fitxa assignada (o un admin) pot canviar aquesta aprovació';
    end if;
    new.approved_responsable_by :=
      case when new.approved_responsable_at is null then null else auth.uid() end;
  else
    -- Si la casella no s'ha mogut, l'atribució tampoc: no es pot reescriure
    -- qui l'havia marcat.
    new.approved_responsable_by := old.approved_responsable_by;
  end if;

  if new.approved_tecnics_at is distinct from old.approved_tecnics_at then
    if not admin and not public.is_global_team_member('tecnics')
       and not (new.approved_tecnics_at is null and responsable) then
      raise exception 'Només algú de l''equip de tècnics (o un admin) pot canviar aquesta aprovació';
    end if;
    new.approved_tecnics_by :=
      case when new.approved_tecnics_at is null then null else auth.uid() end;
  else
    new.approved_tecnics_by := old.approved_tecnics_by;
  end if;

  if new.approved_propietari_at is distinct from old.approved_propietari_at then
    if not admin and not public.is_global_team_member('propietaris')
       and not (new.approved_propietari_at is null and responsable) then
      raise exception 'Només algú de l''equip de propietaris (o un admin) pot canviar aquesta aprovació';
    end if;
    new.approved_propietari_by :=
      case when new.approved_propietari_at is null then null else auth.uid() end;
  else
    new.approved_propietari_by := old.approved_propietari_by;
  end if;

  -- Peticions de revisió: les demana l'actor mateix; les pot retirar ell o el
  -- responsable (quan torna a marcar la fitxa com a feta).
  if new.review_tecnics_at is distinct from old.review_tecnics_at then
    if not admin and not public.is_global_team_member('tecnics')
       and not (new.review_tecnics_at is null and responsable) then
      raise exception 'Només algú de l''equip de tècnics (o un admin) pot demanar la revisió';
    end if;
    new.review_tecnics_by :=
      case when new.review_tecnics_at is null then null else auth.uid() end;
  else
    new.review_tecnics_by := old.review_tecnics_by;
  end if;

  if new.review_propietari_at is distinct from old.review_propietari_at then
    if not admin and not public.is_global_team_member('propietaris')
       and not (new.review_propietari_at is null and responsable) then
      raise exception 'Només algú de l''equip de propietaris (o un admin) pot demanar la revisió';
    end if;
    new.review_propietari_by :=
      case when new.review_propietari_at is null then null else auth.uid() end;
  else
    new.review_propietari_by := old.review_propietari_by;
  end if;

  return new;
end $$;

drop trigger if exists tickets_guard_approvals on public.tickets;
create trigger tickets_guard_approvals
  before update on public.tickets
  for each row execute function public.guard_ticket_approvals();

drop policy if exists tickets_update on public.tickets;
-- Ull: aquesta policy és la porta de la FILA, i l'RLS no distingeix columnes.
-- Per això deixa passar tant qui pot editar la fitxa com qui només hi pot
-- aprovar: si no, l'UPDATE d'una aprovació feta per un responsable que no és
-- l'autor de la fitxa no afectaria cap fila i fallaria en silenci. Els límits
-- per columna els posen els triggers (guard_ticket_approvals per a les
-- aprovacions, i el bloqueig dels camps de contingut de més amunt).
create policy tickets_update on public.tickets
  for update to authenticated
  using (public.can_edit_ticket(id) or public.can_approve_ticket(id))
  with check (public.can_edit_ticket(id) or public.can_approve_ticket(id));

commit;
