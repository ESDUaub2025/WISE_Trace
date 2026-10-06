create table public.lot_state_event(id bigint generated always as identity primary key,cooperative_id uuid not null references public.cooperative,lot_id uuid not null references public.lot,state text not null,observed_at timestamptz not null,recorded_at timestamptz not null default now(),author_id uuid);
alter table public.lot_state_event enable row level security;
revoke all on public.lot_state_event from anon,authenticated;
grant select on public.lot_state_event to authenticated;
create policy history_read on public.lot_state_event for select to authenticated using(private.can_read(cooperative_id));
create trigger immutable before update or delete on public.lot_state_event for each row execute function private.immutable();
create function private.record_state() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if TG_OP='INSERT' or NEW.state is distinct from OLD.state then insert into public.lot_state_event(cooperative_id,lot_id,state,observed_at,author_id) values(NEW.cooperative_id,NEW.id,NEW.state,case when TG_OP='INSERT' then NEW.observed_at else now() end,auth.uid()); end if;return NEW;end $$;
create trigger state_history after insert or update on public.lot for each row execute function private.record_state();
create function private.validate_observed_input() returns trigger language plpgsql security definer set search_path='' as $$ declare historical text; begin
 select state into historical from public.lot_state_event where lot_id=NEW.input_lot_id and observed_at<=NEW.observed_at order by observed_at desc,id desc limit 1;
 if historical is null then raise exception 'Input did not exist at observed time'; end if;
 if historical in ('hold','on_hold','rejected','recalled','withdrawn','closed') then raise exception 'Input ineligible at observed time'; end if;
 return NEW;
end $$;
create trigger observed_input before insert on public.consumption for each row execute function private.validate_observed_input();
create function public.resolve_sync_conflict(target uuid,corrected_payload jsonb,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.sync_receipt; response jsonb; replacement jsonb;
begin
 select * into r from public.sync_receipt where id=target and status='conflict';
 if r.id is null or not private.can_operate(r.cooperative_id,array['supervisor']) or length(reason)<3 then raise exception 'Conflict review denied'; end if;
 replacement:=r.payload||jsonb_build_object('id',gen_random_uuid(),'author_id',auth.uid(),'observed_at',now(),'payload',corrected_payload||jsonb_build_object('reason',reason));
 response:=public.apply_sync(replacement);
 if response->>'status'='synced' then
 update public.task set status='resolved',details=details||jsonb_build_object('replacement_id',response->>'id','resolution_reason',reason,'reviewer',auth.uid()) where source_key='conflict:'||target;
 end if;return response;
end $$;
create function public.record_amendment(target uuid,changes jsonb,reason text,device uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lot; result uuid:=gen_random_uuid();
begin
 select * into l from public.lot where id=target;
 if not private.can_operate(l.cooperative_id,array['supervisor','food_safety']) or length(reason)<3 then raise exception 'Amendment permission and reason required'; end if;
 perform private.require_device(device,l.cooperative_id);
 insert into public.amendment values(result,l.cooperative_id,target,'lot',changes,reason,auth.uid(),device,now(),now());return result;
end $$;
grant execute on function public.resolve_sync_conflict(uuid,jsonb,text),public.record_amendment(uuid,jsonb,text,uuid) to authenticated;
