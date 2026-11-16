create function private.validate_lot() returns trigger language plpgsql security definer set search_path='' as $$
declare supplier_coop uuid; device_coop uuid; config_coop uuid;
begin
 if NEW.type='whey' and (NEW.generation_at is null or NEW.generation_at>NEW.observed_at) then raise exception 'Whey generation must precede receipt'; end if;
 if NEW.observed_at>now()+interval '5 minutes' then raise exception 'Impossible receipt date'; end if;
 select cooperative_id into device_coop from public.device where id=NEW.device_id and revoked_at is null;
 if device_coop is distinct from NEW.cooperative_id then raise exception 'Device cooperative mismatch'; end if;
 if NEW.supplier_id is not null then select cooperative_id into supplier_coop from public.supplier where id=NEW.supplier_id;if supplier_coop<>NEW.cooperative_id then raise exception 'Supplier cooperative mismatch'; end if;end if;
 select cooperative_id into config_coop from public.config_version where id=NEW.config_version_id;
 if config_coop is not null and config_coop<>NEW.cooperative_id then raise exception 'Configuration scope mismatch'; end if;
 return NEW;
end $$;
create trigger validate_lot before insert on public.lot for each row execute function private.validate_lot();
create function private.validate_operational() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb; checkpoint jsonb; equipment public.equipment;
begin
 select definition into rules from public.config_version where id=NEW.config_version_id;
 select value into checkpoint from jsonb_array_elements(coalesce(rules->'checkpoints','[]')) where value->>'key'=NEW.definition_key;
 if NEW.kind='checkpoint' and checkpoint->>'unit' is not null and NEW.payload->>'unit' is distinct from checkpoint->>'unit' then raise exception 'Checkpoint unit mismatch'; end if;
 if nullif(NEW.payload->>'equipment_id','') is not null then
 select * into equipment from public.equipment where id=(NEW.payload->>'equipment_id')::uuid;
 if equipment.cooperative_id is distinct from NEW.cooperative_id or equipment.status<>'active' then raise exception 'Equipment unavailable'; end if;
 if equipment.next_due_at<NEW.observed_at then insert into public.task(cooperative_id,lot_id,kind,due_at,details) values(NEW.cooperative_id,NEW.lot_id,'calibration',now(),jsonb_build_object('equipment_id',equipment.id,'warning','Measurement recorded with overdue equipment')); end if;
 end if;return NEW;
end $$;
create trigger validate_operational before insert on public.operational_record for each row execute function private.validate_operational();
create function public.reconcile_stock(target uuid,counted numeric,reason text,device uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lot; difference numeric; result uuid:=gen_random_uuid();
begin
 select * into l from public.lot where id=target for update;
 if not private.can_operate(l.cooperative_id,array['supervisor','manager']) or length(reason)<3 or counted<0 then raise exception 'Stock reconciliation denied'; end if;
 perform private.require_device(device,l.cooperative_id);difference:=counted-public.lot_available(target);
 if difference=0 then return null;end if;
 perform set_config('wise.reason',reason,true);
 insert into public.inventory_movement values(result,l.cooperative_id,target,'adjusted',difference,l.unit,reason,wise_auth.uid(),device,now(),now());return result;
end $$;
grant execute on function public.reconcile_stock(uuid,numeric,text,uuid) to authenticated;
