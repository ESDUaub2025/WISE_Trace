create table public.stage_event(id uuid primary key default gen_random_uuid(),cooperative_id uuid not null references public.cooperative,lot_id uuid not null references public.lot,stage text not null,observed_at timestamptz not null,recorded_at timestamptz not null default now(),author_id uuid);
alter table public.stage_event enable row level security;
revoke all on public.stage_event from anon,authenticated;
grant select on public.stage_event to authenticated;
create policy stage_read on public.stage_event for select to authenticated using(private.can_read(cooperative_id));
create trigger immutable before update or delete on public.stage_event for each row execute function private.immutable();
insert into public.stage_event(cooperative_id,lot_id,stage,observed_at) select l.cooperative_id,l.id,l.stage,coalesce((select max(recorded_at) from public.audit_event where object_id=l.id::text and field='stage' and old_value is not null and old_value<>'null'),l.observed_at) from public.lot l where l.type='batch' and l.stage is not null;
create function private.record_stage() returns trigger language plpgsql security definer set search_path='' as $$
declare entered timestamptz;
begin
 if NEW.type='batch' and (TG_OP='INSERT' or NEW.stage is distinct from OLD.stage) then
 entered:=case when TG_OP='INSERT' then NEW.observed_at else coalesce(nullif(current_setting('wise.observed_at',true),'')::timestamptz,now()) end;
 if exists(select 1 from public.stage_event where lot_id=NEW.id and observed_at>entered) then raise exception 'Stage change precedes previously recorded stage'; end if;
 insert into public.stage_event(cooperative_id,lot_id,stage,observed_at,author_id) values(NEW.cooperative_id,NEW.id,NEW.stage,entered,wise_auth.uid());
 end if;return NEW;
end $$;
create trigger stage_history after insert or update on public.lot for each row execute function private.record_stage();
create or replace function private.hold_critical() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if NEW.severity='critical' and NEW.closed_at is null then
 perform set_config('wise.transition','authorized',true);
 update public.lot set state='on_hold' where id=NEW.lot_id and state not in ('rejected','recalled','withdrawn','closed');
 update public.lot set state='on_hold' where id in(select lot_id from public.packaging_detail where batch_id=NEW.lot_id) and state not in ('rejected','recalled','withdrawn','closed');
 insert into public.notification(cooperative_id,kind,payload) values(NEW.cooperative_id,'critical_deviation',jsonb_build_object('lot_id',NEW.lot_id,'deviation_id',NEW.id));
 end if; return NEW; end $$;
