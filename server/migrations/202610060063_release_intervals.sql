create function private.require_checkpoint_intervals() returns trigger language plpgsql security definer set search_path='' as $$
declare cp jsonb;rules jsonb;started timestamptz;ended timestamptz;first_due timestamptz;seconds numeric;slots integer;
begin
 if NEW.outcome<>'released' then return NEW;end if;
 select cv.definition into rules from public.lot l join public.config_version cv on cv.id=l.config_version_id where l.id=NEW.lot_id;
 for cp in select value from jsonb_array_elements(rules->'checkpoints') where coalesce((value->>'required')::boolean,false) and (value->>'interval_hours')::numeric>0 loop
  select min(observed_at) into started from public.stage_event where lot_id=NEW.lot_id and stage=cp->>'stage';
  if started is null then raise exception 'Required recurring stage history missing';end if;
  select least(NEW.observed_at,coalesce((select min(observed_at) from public.stage_event where lot_id=NEW.lot_id and stage<>cp->>'stage' and observed_at>started),NEW.observed_at)) into ended;
  first_due:=started+make_interval(secs=>coalesce((cp->>'offset_hours')::numeric,0)*3600);seconds:=(cp->>'interval_hours')::numeric*3600;
  slots:=greatest(0,ceil(extract(epoch from ended-first_due)/seconds)::integer);
  if slots>100000 then raise exception 'Recurring checkpoint history exceeds review limit';end if;
  if slots>0 then for slot in 0..slots-1 loop
   if not exists(select 1 from public.operational_record r where r.lot_id=NEW.lot_id and r.definition_key=cp->>'key' and r.observed_at>=started and r.observed_at<ended and greatest(0,floor(extract(epoch from r.observed_at-first_due)/seconds))=slot and (not coalesce((cp->>'required_photo')::boolean,false) or exists(select 1 from public.attachment a where a.record_id=r.id and a.media_type like 'image/%'))) then raise exception 'Required recurring checkpoint interval missing';end if;
  end loop;end if;
 end loop;
 return NEW;
end $$;
revoke all on function private.require_checkpoint_intervals() from public,anon,authenticated;
create trigger require_checkpoint_intervals before insert on public.decision for each row execute function private.require_checkpoint_intervals();
