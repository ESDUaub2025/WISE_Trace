create or replace function private.check_whey_decision() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.lot; rules jsonb; threshold jsonb; val numeric; outside boolean:=false;
begin
 select * into l from public.lot where id=NEW.lot_id;
 if l.type<>'whey' or NEW.outcome<>'accepted' then return NEW;end if;
 select definition into rules from public.config_version where id=l.config_version_id;
 if l.generation_at+make_interval(hours=>(rules->>'whey_max_age_hours')::integer)<=NEW.observed_at then raise exception 'Whey exceeds configured maximum age'; end if;
 for threshold in select value from jsonb_array_elements(coalesce(rules->'reception_measurements','[]')) loop
 if threshold->>'response_type'='text' then
 if coalesce((threshold->>'required')::boolean,false) and nullif(trim(l.facts->>(threshold->>'key')),'') is null then raise exception 'Required reception measurement missing';end if;continue;end if;
 val:=(l.facts->>(threshold->>'key'))::numeric;
 if (threshold->>'required')::boolean and val is null then raise exception 'Required reception measurement missing'; end if;
 if val<(threshold->>'min')::numeric or val>(threshold->>'max')::numeric then outside:=true; end if;
 end loop;
 if outside then
 if length(NEW.reason)<5 then raise exception 'Threshold override requires justification'; end if;
 insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,detected_value,corrective_action,author_id,device_id,observed_at) values(gen_random_uuid(),l.cooperative_id,l.id,'reception_override','major','Accepted outside configured reception thresholds',l.facts,NEW.reason,NEW.user_id,l.device_id,NEW.observed_at);
 end if;return NEW;
end $$;

revoke all on function private.check_whey_decision() from public,anon,authenticated;
