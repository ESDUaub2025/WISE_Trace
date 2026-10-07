create or replace function private.validate_operational() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb; checkpoint jsonb; equipment public.equipment;
begin
 select definition into rules from public.config_version where id=NEW.config_version_id;
 select value into checkpoint from jsonb_array_elements(coalesce(rules->'checkpoints','[]')) where value->>'key'=NEW.definition_key;
 if NEW.kind='checkpoint' and checkpoint->>'unit' is not null and NEW.payload->>'unit' is distinct from checkpoint->>'unit' then raise exception 'Checkpoint unit mismatch'; end if;
 if nullif(NEW.payload->>'equipment_id','') is not null then
 select * into equipment from public.equipment where id=(NEW.payload->>'equipment_id')::uuid;
 if equipment.cooperative_id is distinct from NEW.cooperative_id or equipment.status<>'active' then raise exception 'Equipment unavailable'; end if;
 if equipment.next_due_at<NEW.observed_at then if rules->'data_quality_rules'->>'overdue_calibration'='blocking' then raise exception 'SOP blocks measurements with overdue calibration';end if;insert into public.task(cooperative_id,lot_id,kind,due_at,details) values(NEW.cooperative_id,NEW.lot_id,'calibration',now(),jsonb_build_object('equipment_id',equipment.id,'warning','Measurement recorded with overdue equipment')); end if;
 end if;if rules->'data_quality_rules'->>'late_entries'='blocking' and NEW.observed_at<now()-make_interval(hours=>coalesce((rules->>'late_entry_hours')::integer,24)) then raise exception 'Late record requires supervisor conflict review';end if;return NEW;
end $$;
create or replace function private.validate_storage_inspection() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb;begin
 if NEW.kind<>'storage_inspection' then return NEW;end if;
 if length(trim(coalesce(NEW.payload->>'storage_location','')))<1 then raise exception 'Storage location required';end if;
 select definition into rules from public.config_version where id=NEW.config_version_id;
 if coalesce((rules->>'storage_temperature_required')::boolean,false) and NEW.payload->>'temperature' is null then raise exception 'Storage temperature required by SOP';end if;
 if coalesce((rules->>'storage_humidity_required')::boolean,false) and NEW.payload->>'humidity' is null then raise exception 'Storage humidity required by SOP';end if;
 if (NEW.payload->>'humidity')::numeric not between 0 and 100 then raise exception 'Humidity must be between zero and one hundred';end if;
 NEW.payload:=jsonb_set(NEW.payload,'{all_ok}',to_jsonb(coalesce((NEW.payload->>'clean')::boolean,false) and coalesce((NEW.payload->>'dry')::boolean,false) and coalesce((NEW.payload->>'pest_protected')::boolean,false) and coalesce((NEW.payload->>'off_floor')::boolean,false)));
 if not coalesce((NEW.payload->>'all_ok')::boolean,false) or (NEW.payload->>'temperature')::numeric<(rules->>'storage_temperature_min')::numeric or (NEW.payload->>'temperature')::numeric>(rules->>'storage_temperature_max')::numeric or (NEW.payload->>'humidity')::numeric>(rules->>'storage_humidity_max')::numeric then
 insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,author_id,device_id,observed_at) values(gen_random_uuid(),NEW.cooperative_id,NEW.lot_id,'storage',case when rules->'data_quality_rules'->>'storage_conditions'='blocking' then 'critical' else 'major' end,'Storage inspection requires corrective action',NEW.author_id,NEW.device_id,NEW.observed_at);
 end if;return NEW;
end $$;
create function private.validate_dictionary_policy() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;rule record;begin
 if NEW.kind<>'sop' then return NEW;end if;
 if NEW.definition ? 'units' and (jsonb_typeof(NEW.definition->'units')<>'array' or jsonb_array_length(NEW.definition->'units')=0 or exists(select 1 from jsonb_array_elements_text(NEW.definition->'units') unit where unit not in ('kg','L','unit'))) then raise exception 'Units must use the supported measured units';end if;
 if NEW.definition ? 'ingredient_types' then
 if jsonb_typeof(NEW.definition->'ingredient_types')<>'array' or jsonb_array_length(NEW.definition->'ingredient_types') not between 1 and 30 then raise exception 'Ingredient types must be a nonempty bounded list';end if;
 for item in select value from jsonb_array_elements(NEW.definition->'ingredient_types') loop if jsonb_typeof(item)<>'string' or length(item#>>'{}') not between 1 and 50 then raise exception 'Ingredient type must be a short name';end if;end loop;
 end if;
 if NEW.definition ? 'data_quality_rules' then
 if jsonb_typeof(NEW.definition->'data_quality_rules')<>'object' then raise exception 'Data quality rules must be an object';end if;
 for rule in select * from jsonb_each_text(NEW.definition->'data_quality_rules') loop if rule.key not in ('reception_range','overdue_calibration','storage_conditions','late_entries') or rule.value not in ('warning','blocking') then raise exception 'Unsupported configurable rule; physical and safety invariants always block';end if;end loop;
 end if;return NEW;
end $$;
create trigger validate_dictionary_policy before insert or update on public.config_version for each row execute function private.validate_dictionary_policy();
create function private.block_receipt_override() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.lot;rules jsonb;rule jsonb;value numeric;begin
 if NEW.outcome<>'accepted' then return NEW;end if;
 select * into l from public.lot where id=NEW.lot_id;select definition into rules from public.config_version where id=l.config_version_id;
 if l.type='whey' and rules->'data_quality_rules'->>'reception_range'='blocking' then
 for rule in select item from jsonb_array_elements(rules->'reception_measurements') item where coalesce(item->>'response_type','number')='number' loop value:=(l.facts->>(rule->>'key'))::numeric;if value<(rule->>'min')::numeric or value>(rule->>'max')::numeric then raise exception 'SOP blocks reception range overrides';end if;end loop;
 end if;return NEW;
end $$;
create trigger block_receipt_override before insert on public.decision for each row execute function private.block_receipt_override();
create function private.block_critical_stock_sale() returns trigger language plpgsql security definer set search_path='' as $$begin
 if NEW.transaction_type<>'return' and exists(select 1 from public.deviation d where d.closed_at is null and d.severity='critical' and (d.lot_id=NEW.packaging_lot_id or d.lot_id in(select batch_id from public.packaging_detail where lot_id=NEW.packaging_lot_id))) then raise exception 'Resolve critical stock deviation before sale';end if;return NEW;
end $$;
create trigger block_critical_stock_sale before insert on public.sale for each row execute function private.block_critical_stock_sale();
