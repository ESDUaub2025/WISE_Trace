create function private.validate_sop_definition(definition jsonb) returns void language plpgsql immutable set search_path='' as $$
declare stage jsonb;checkpoint jsonb;
begin
 if jsonb_typeof(definition) is distinct from 'object' or jsonb_typeof(definition->'stages') is distinct from 'array' or jsonb_array_length(definition->'stages')=0 or jsonb_typeof(definition->'checkpoints') is distinct from 'array' then raise exception 'SOP stages/checkpoints required';end if;
 if (select count(*)<>count(distinct value->>'key') from jsonb_array_elements(definition->'stages')) or (select count(*)<>count(distinct value->>'key') from jsonb_array_elements(definition->'checkpoints')) then raise exception 'Configuration keys must be unique';end if;
 for stage in select value from jsonb_array_elements(definition->'stages') loop
  if coalesce(stage->>'key','')='' or coalesce(stage->'label'->>'en','')='' or coalesce(stage->'label'->>'ar','')='' then raise exception 'Bilingual stage labels required';end if;
  if stage ? 'expected_hours' and (stage->>'expected_hours')::numeric<=0 then raise exception 'Stage duration must be positive';end if;
 end loop;
 for checkpoint in select value from jsonb_array_elements(definition->'checkpoints') loop
  if coalesce(checkpoint->'label'->>'en','')='' or coalesce(checkpoint->'label'->>'ar','')='' or jsonb_typeof(checkpoint->'required') is distinct from 'boolean' or not exists(select 1 from jsonb_array_elements(definition->'stages') where value->>'key'=checkpoint->>'stage') then raise exception 'Checkpoint labels, requirement and known stage required';end if;
  if checkpoint ? 'interval_hours' and (checkpoint->>'interval_hours')::numeric<=0 then raise exception 'Checkpoint interval must be positive';end if;
  if (checkpoint->>'min')::numeric>(checkpoint->>'max')::numeric or (checkpoint->>'min_plausible')::numeric>(checkpoint->>'max_plausible')::numeric then raise exception 'Invalid checkpoint range';end if;
 end loop;
 if coalesce((definition->>'whey_max_age_hours')::numeric,0)<=0 or coalesce((definition->>'shelf_life_days')::numeric,0)<=0 then raise exception 'Positive shelf-life configuration required';end if;
end $$;
revoke all on function private.validate_sop_definition(jsonb) from public,anon,authenticated;
create function public.draft_scoped_configuration(kind text,definition jsonb,effective timestamptz,scope uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not private.has_role(array['admin']) then raise exception 'Admin AAL2 required';end if;
 if kind not in ('sop','reference','kpi') or effective is null or not isfinite(effective) or jsonb_typeof(definition) is distinct from 'object' then raise exception 'Invalid configuration document';end if;
 if scope is not null and not exists(select 1 from public.cooperative where id=scope and status='active') then raise exception 'Active cooperative scope required';end if;
 if kind='sop' then perform private.validate_sop_definition(definition);end if;
 perform pg_advisory_xact_lock(hashtextextended('configuration:'||kind||':'||coalesce(scope::text,'global'),0));
 insert into public.config_version(cooperative_id,kind,version,effective_at,definition,drafted_by,placeholder)
 values(scope,kind,coalesce((select max(cv.version)+1 from public.config_version cv where cv.kind=draft_scoped_configuration.kind and cv.cooperative_id is not distinct from scope),1),effective,definition,wise_auth.uid(),true) returning id into target;
 return target;
end $$;
revoke all on function public.draft_scoped_configuration(text,jsonb,timestamptz,uuid) from public,anon;
grant execute on function public.draft_scoped_configuration(text,jsonb,timestamptz,uuid) to authenticated;
create or replace function public.draft_configuration(kind text,definition jsonb,effective timestamptz) returns uuid language sql security definer set search_path='' as $$
 select public.draft_scoped_configuration(kind,definition,effective,null);
$$;
revoke all on function public.draft_configuration(text,jsonb,timestamptz) from public,anon;
grant execute on function public.draft_configuration(text,jsonb,timestamptz) to authenticated;
