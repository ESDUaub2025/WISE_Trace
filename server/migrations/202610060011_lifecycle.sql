create function public.abandon_batch(target uuid,reason text) returns void language plpgsql security definer set search_path='' as $$ declare l public.lot; begin
 select * into l from public.lot where id=target for update;
 if not private.can_operate(l.cooperative_id,array['producer','supervisor']) or l.type<>'batch' or l.state not in ('draft','in_production','on_hold') or length(reason)<3 or exists(select 1 from public.packaging_detail where batch_id=target) then raise exception 'Batch abandonment denied'; end if;
 perform set_config('wise.reason',reason,true);update public.lot set state='rejected',facts=facts||jsonb_build_object('abandoned',true,'abandonment_reason',reason) where id=target;
end $$;
create function public.handover_batch(target uuid,next_producer uuid,device uuid) returns void language plpgsql security definer set search_path='' as $$ declare l public.lot;begin
 select * into l from public.lot where id=target for update;
 if not private.can_operate(l.cooperative_id,array['producer','supervisor']) or l.state not in ('draft','in_production') or not exists(select 1 from public.membership where user_id=next_producer and cooperative_id=l.cooperative_id and status='active' and 'producer'=any(roles)) then raise exception 'Handover denied';end if;
 perform private.require_device(device,l.cooperative_id);
 insert into public.operational_record(id,cooperative_id,lot_id,kind,config_version_id,payload,author_id,device_id,observed_at) values(gen_random_uuid(),l.cooperative_id,target,'handover',l.config_version_id,jsonb_build_object('from',coalesce(l.facts->>'responsible_producer',l.producer_id::text),'to',next_producer),wise_auth.uid(),device,now());
 update public.lot set facts=facts||jsonb_build_object('responsible_producer',next_producer) where id=target;
end $$;
create function private.close_empty_batch() returns trigger language plpgsql security definer set search_path='' as $$ declare batch uuid; begin
 if NEW.type not in ('sold','distributed','lost','disposed') then return NEW;end if;
 select batch_id into batch from public.packaging_detail where lot_id=NEW.lot_id;
 if batch is not null and exists(select 1 from public.lot where id=batch and state='released') and not exists(select 1 from public.packaging_detail where batch_id=batch and public.lot_available(lot_id)>0) then
 perform set_config('wise.transition','authorized',true);update public.lot set state='closed' where id=batch;
 end if;return NEW;
end $$;
create trigger close_empty_batch after insert on public.inventory_movement for each row execute function private.close_empty_batch();
grant execute on function public.abandon_batch(uuid,text),public.handover_batch(uuid,uuid,uuid) to authenticated;
