create function private.validate_checkpoint_response() returns trigger language plpgsql security definer set search_path='' as $$
declare checkpoint jsonb; rules jsonb;
begin
 if NEW.kind<>'checkpoint' then return NEW; end if;
 select definition into rules from public.config_version where id=NEW.config_version_id;
 select value into checkpoint from jsonb_array_elements(rules->'checkpoints') where value->>'key'=NEW.definition_key;
 if checkpoint->>'unit' is not null or checkpoint->>'response_type'='number' then
 if nullif(NEW.payload->>'value','') is null then raise exception 'Numeric checkpoint requires a confirmed value'; end if;
 else
 if NEW.payload->>'all_ok' is null then raise exception 'Checkpoint requires a checklist response'; end if;
 if not (NEW.payload->>'all_ok')::boolean then
 insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,detected_value,author_id,device_id,observed_at) values(gen_random_uuid(),NEW.cooperative_id,NEW.lot_id,NEW.definition_key,coalesce(checkpoint->>'severity','critical'),'Checklist exception requires review',NEW.payload,NEW.author_id,NEW.device_id,NEW.observed_at);
 end if;end if;return NEW;
end $$;
create trigger checkpoint_response before insert on public.operational_record for each row execute function private.validate_checkpoint_response();
create function private.check_release_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb; checkpoint jsonb;
begin
 if NEW.outcome<>'released' then return NEW; end if;
 select cv.definition into rules from public.lot l join public.config_version cv on cv.id=l.config_version_id where l.id=NEW.lot_id;
 for checkpoint in select value from jsonb_array_elements(rules->'checkpoints') where coalesce((value->>'required_photo')::boolean,false) and coalesce((value->>'required')::boolean,false) loop
 if not exists(select 1 from public.operational_record record join public.attachment evidence on evidence.record_id=record.id where record.lot_id=NEW.lot_id and record.definition_key=checkpoint->>'key' and evidence.media_type like 'image/%') then raise exception 'Required checkpoint photo has not synchronized'; end if;
 end loop;return NEW;
end $$;
create trigger release_evidence before insert on public.decision for each row execute function private.check_release_evidence();
