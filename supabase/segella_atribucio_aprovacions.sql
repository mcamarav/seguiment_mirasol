-- =============================================================================
-- Segella qui ha marcat cada aprovació
--
-- Actualització per a una base de dades que ja té l'esquema multiprojecte
-- (`supabase/schema.sql`) executat. Refà el trigger guard_ticket_approvals
-- perquè, quan una casella d'aprovació o de revisió no es mou, el camp «_by»
-- corresponent es quedi com estava: la policy d'UPDATE deixa entrar tothom qui
-- pot aprovar, i sense això es podia reescriure per API qui havia aprovat una
-- casella que no s'estava tocant.
--
-- Es pot executar diverses vegades sense fer mal. A les instal·lacions noves ja
-- ve dins de schema.sql i no cal executar res d'aquí.
-- =============================================================================

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
  else
    -- Si la casella no s'ha mogut, l'atribució tampoc: no es pot reescriure
    -- qui l'havia marcat.
    new.approved_responsable_by := old.approved_responsable_by;
  end if;

  if new.approved_tecnics_at is distinct from old.approved_tecnics_at then
    if not manager and not public.is_global_team_member(old.project_id, 'tecnics')
       and not (new.approved_tecnics_at is null and responsable) then
      raise exception 'Només algú de l''equip de tècnics del projecte pot canviar aquesta aprovació';
    end if;
    new.approved_tecnics_by :=
      case when new.approved_tecnics_at is null then null else auth.uid() end;
  else
    new.approved_tecnics_by := old.approved_tecnics_by;
  end if;

  if new.approved_propietari_at is distinct from old.approved_propietari_at then
    if not manager and not public.is_global_team_member(old.project_id, 'propietaris')
       and not (new.approved_propietari_at is null and responsable) then
      raise exception 'Només algú de l''equip de propietaris del projecte pot canviar aquesta aprovació';
    end if;
    new.approved_propietari_by :=
      case when new.approved_propietari_at is null then null else auth.uid() end;
  else
    new.approved_propietari_by := old.approved_propietari_by;
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
  else
    new.review_tecnics_by := old.review_tecnics_by;
  end if;

  if new.review_propietari_at is distinct from old.review_propietari_at then
    if not manager and not public.is_global_team_member(old.project_id, 'propietaris')
       and not (new.review_propietari_at is null and responsable) then
      raise exception 'Només algú de l''equip de propietaris del projecte pot demanar la revisió';
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
