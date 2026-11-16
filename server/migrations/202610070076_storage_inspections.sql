create function private.validate_storage_inspection() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb;begin
 if NEW.kind<>'storage_inspection' then return NEW;end if;
 if length(trim(coalesce(NEW.payload->>'storage_location','')))<1 then raise exception 'Storage location required';end if;
 select definition into rules from public.config_version where id=NEW.config_version_id;
 if coalesce((rules->>'storage_temperature_required')::boolean,false) and NEW.payload->>'temperature' is null then raise exception 'Storage temperature required by SOP';end if;
 if coalesce((rules->>'storage_humidity_required')::boolean,false) and NEW.payload->>'humidity' is null then raise exception 'Storage humidity required by SOP';end if;
 if (NEW.payload->>'humidity')::numeric not between 0 and 100 then raise exception 'Humidity must be between zero and one hundred';end if;
 if not coalesce((NEW.payload->>'all_ok')::boolean,false) then
 insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,author_id,device_id,observed_at) values(gen_random_uuid(),NEW.cooperative_id,NEW.lot_id,'storage','major','Storage inspection requires corrective action',NEW.author_id,NEW.device_id,NEW.observed_at);
 end if;return NEW;
end $$;
create trigger validate_storage_inspection before insert on public.operational_record for each row execute function private.validate_storage_inspection();
alter function public.generate_tasks() rename to generate_tasks_before_storage;
alter function public.generate_tasks_before_storage() set schema private;
revoke all on function private.generate_tasks_before_storage() from public,anon,authenticated,service_role;
create function public.generate_tasks() returns integer language plpgsql security definer set search_path='' as $$
declare result integer; l record;latest timestamptz;due timestamptz;begin
 result:=private.generate_tasks_before_storage();
 for l in select lot.*,cv.definition from public.lot lot join public.config_version cv on cv.id=lot.config_version_id where lot.type='packaging' and public.lot_available(lot.id)>0 and lot.state not in ('closed','rejected') loop
 select max(r.observed_at) into latest from public.operational_record r where r.lot_id=l.id and r.kind='storage_inspection' and exists(select 1 from public.attachment a where a.record_id=r.id and a.media_type like 'image/%');
 due:=coalesce(latest,l.observed_at)+make_interval(secs=>greatest(1,coalesce((l.definition->>'storage_inspection_interval_hours')::numeric,168))*3600);
 insert into public.task(cooperative_id,lot_id,kind,due_at,details,source_key) values(l.cooperative_id,l.id,'storage_inspection_due',due,'{}','storage:'||l.id||':'||due) on conflict(source_key) do nothing;
 end loop;select count(*) into result from public.task where status='open';return result;
end $$;
revoke all on function public.generate_tasks() from public,anon,authenticated;
grant execute on function public.generate_tasks() to service_role;
create function private.complete_storage_task() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if NEW.media_type like 'image/%' then update public.task set status='done' where kind='storage_inspection_due' and status='open' and lot_id in(select lot_id from public.operational_record where id=NEW.record_id and kind='storage_inspection') and due_at<=(select r.observed_at+make_interval(secs=>greatest(1,coalesce((c.definition->>'storage_inspection_interval_hours')::numeric,168))*3600) from public.operational_record r join public.config_version c on c.id=r.config_version_id where r.id=NEW.record_id);end if;return NEW;
end $$;
create trigger complete_storage_task after insert on public.attachment for each row execute function private.complete_storage_task();
