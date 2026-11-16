create function private.validate_receipt_measurements() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb;rule jsonb;entry jsonb;reading numeric;equipment public.equipment;measured timestamptz;
begin
 if new.type<>'whey' then return new;end if;
 select definition into rules from public.config_version where id=new.config_version_id;
 if new.facts->>'collection_at' is not null and ((new.facts->>'collection_at')::timestamptz>new.observed_at or (new.facts->>'collection_at')::timestamptz<new.generation_at) then raise exception 'Collection must be between generation and receipt';end if;
 for rule in select value from jsonb_array_elements(coalesce(rules->'reception_measurements','[]')) loop
  if rule->>'response_type'='text' or new.facts->>(rule->>'key') is null then continue;end if;
  reading:=(new.facts->>(rule->>'key'))::numeric;
  if reading::text in ('NaN','Infinity','-Infinity') or reading<(rule->>'min_plausible')::numeric or reading>(rule->>'max_plausible')::numeric then raise exception 'Implausible reception measurement';end if;
 end loop;
 if new.facts ? 'measurements' then
  if jsonb_typeof(new.facts->'measurements') is distinct from 'array' then raise exception 'Receipt measurements must be an array';end if;
  if exists(select 1 from jsonb_array_elements(new.facts->'measurements') a group by a->>'key' having count(*)>1) then raise exception 'Duplicate receipt measurement';end if;
  for entry in select value from jsonb_array_elements(new.facts->'measurements') loop
   select value into rule from jsonb_array_elements(coalesce(rules->'reception_measurements','[]')) where value->>'key'=entry->>'key';
   if rule is null or entry->'value' is distinct from new.facts->(entry->>'key') or entry->>'user_id' is distinct from new.producer_id::text then raise exception 'Receipt measurement attribution mismatch';end if;
   measured:=(entry->>'observed_at')::timestamptz;
   if measured is null or measured>new.observed_at+interval '5 minutes' or measured<new.generation_at then raise exception 'Invalid receipt measurement time';end if;
   if rule->>'unit' is not null and entry->>'unit' is distinct from rule->>'unit' then raise exception 'Reception measurement unit mismatch';end if;
   if coalesce((rule->>'equipment_required')::boolean,false) and nullif(entry->>'equipment_id','') is null then raise exception 'Reception measurement equipment required';end if;
   if nullif(entry->>'equipment_id','') is not null then
    select * into equipment from public.equipment where id=(entry->>'equipment_id')::uuid and cooperative_id=new.cooperative_id and status='active';
    if equipment.id is null then raise exception 'Reception equipment unavailable';end if;
    if equipment.next_due_at<measured then
     insert into public.task(cooperative_id,lot_id,kind,due_at,details,source_key) values(new.cooperative_id,null,'calibration',equipment.next_due_at,jsonb_build_object('equipment_id',equipment.id,'receipt_id',new.id),'reception-calibration:'||new.id||':'||equipment.id) on conflict(source_key) do nothing;
    end if;
   end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function private.validate_receipt_measurements() from public,anon,authenticated;
create trigger receipt_measurements before insert on public.lot for each row execute function private.validate_receipt_measurements();
