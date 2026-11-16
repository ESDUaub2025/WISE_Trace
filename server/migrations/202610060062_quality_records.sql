create function private.validate_quality_record() returns trigger language plpgsql security definer set search_path='' as $$
declare lot public.lot;sampled timestamptz;
begin
 if NEW.kind not in ('sample','lab') then return NEW;end if;
 select * into lot from public.lot where id=NEW.lot_id;
 if length(trim(coalesce(NEW.payload->>'sample_id','')))=0 or NEW.payload->>'sampled_at' is null then raise exception 'Sample identity and sampling time required';end if;
 sampled:=(NEW.payload->>'sampled_at')::timestamptz;
 if not isfinite(sampled) or sampled>NEW.observed_at or (lot.generation_at is not null and sampled<lot.generation_at) then raise exception 'Invalid sampling chronology';end if;
 if NEW.kind='lab' and (coalesce(NEW.payload->>'lab','')='' or coalesce(NEW.payload->>'reference','')='' or coalesce(NEW.payload->>'result','') not in ('pass','fail','pending')) then raise exception 'Laboratory, reference and result required';end if;
 return NEW;
end $$;
revoke all on function private.validate_quality_record() from public,anon,authenticated;
create trigger validate_quality_record before insert on public.operational_record for each row execute function private.validate_quality_record();
create function private.require_lab_attachment() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb;
begin
 if NEW.outcome<>'released' then return NEW;end if;
 select cv.definition into rules from public.lot l join public.config_version cv on cv.id=l.config_version_id where l.id=NEW.lot_id;
 if coalesce((rules->>'lab_before_release')::boolean,false) and not exists(select 1 from public.operational_record r join public.attachment a on a.record_id=r.id where r.lot_id=NEW.lot_id and r.kind='lab' and r.payload->>'result'='pass') then raise exception 'Required laboratory report has not synchronized';end if;
 return NEW;
end $$;
revoke all on function private.require_lab_attachment() from public,anon,authenticated;
create trigger require_lab_attachment before insert on public.decision for each row execute function private.require_lab_attachment();
create function private.validate_whey_mass() returns trigger language plpgsql set search_path='' as $$
begin
 if NEW.type='whey' and NEW.unit<>'kg' then raise exception 'Whey received mass must be recorded in kg';end if;return NEW;
end $$;
revoke all on function private.validate_whey_mass() from public,anon,authenticated;
create trigger validate_whey_mass before insert on public.lot for each row execute function private.validate_whey_mass();
