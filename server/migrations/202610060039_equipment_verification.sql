create function private.validate_verification() returns trigger language plpgsql security definer set search_path='' as $$
declare equipment public.equipment;
begin
 if NEW.kind<>'calibration' then return NEW;end if;
 select * into equipment from public.equipment where id=(NEW.payload->>'equipment_id')::uuid and cooperative_id=NEW.cooperative_id and status='active';
 if equipment.id is null or coalesce(NEW.payload->>'method','') not in ('ice_water','reference_weight','standard_buffer','custom') or coalesce(NEW.payload->>'result','') not in ('pass','fail') or NEW.payload->>'reference_value' is null or NEW.payload->>'measured_value' is null or nullif(NEW.payload->>'unit','') is null then raise exception 'Equipment verification requires device, method, reference, measured value, unit and result';end if;
 if NEW.payload->>'result'='fail' then
 insert into public.task(cooperative_id,kind,due_at,details,source_key) values(NEW.cooperative_id,'calibration',NEW.observed_at,jsonb_build_object('equipment_id',equipment.id,'label',equipment.label,'verification_id',NEW.id,'warning','Failed verification requires review'),'verification:'||NEW.id);
 insert into public.notification(cooperative_id,kind,payload) values(NEW.cooperative_id,'equipment_verification_failed',jsonb_build_object('equipment_id',equipment.id,'record_id',NEW.id));
 end if;
 return NEW;
end $$;
create trigger verification_record before insert on public.operational_record for each row execute function private.validate_verification();
revoke all on function private.validate_verification() from public,anon,authenticated;
