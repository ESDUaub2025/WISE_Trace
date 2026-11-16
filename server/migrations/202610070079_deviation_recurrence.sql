alter table public.deviation add column recurrence_count integer not null default 1;
create function private.flag_deviation_recurrence() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb;window_days numeric;begin
 select cv.definition into rules from public.lot l join public.config_version cv on cv.id=l.config_version_id where l.id=NEW.lot_id;
 window_days:=greatest(1,coalesce((rules->>'deviation_recurrence_days')::numeric,30));
 select count(*)+1 into NEW.recurrence_count from public.deviation where cooperative_id=NEW.cooperative_id and category=NEW.category and observed_at between NEW.observed_at-make_interval(days=>window_days::integer) and NEW.observed_at;
 return NEW;
end $$;
create trigger flag_deviation_recurrence before insert on public.deviation for each row execute function private.flag_deviation_recurrence();
create function private.queue_recurrence_review() returns trigger language plpgsql security definer set search_path='' as $$
declare threshold integer;begin
 select greatest(2,coalesce((c.definition->>'deviation_recurrence_threshold')::integer,3)) into threshold from public.lot l join public.config_version c on c.id=l.config_version_id where l.id=NEW.lot_id;
 if NEW.recurrence_count>=coalesce(threshold,3) then insert into public.task(cooperative_id,lot_id,kind,due_at,details,source_key) values(NEW.cooperative_id,NEW.lot_id,'deviation_recurrence',NEW.observed_at,jsonb_build_object('deviation_id',NEW.id,'category',NEW.category,'count',NEW.recurrence_count),'recurrence:'||NEW.id);end if;return NEW;
end $$;
create trigger queue_recurrence_review after insert on public.deviation for each row execute function private.queue_recurrence_review();
