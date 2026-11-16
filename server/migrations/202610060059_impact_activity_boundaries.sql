create or replace function private.whey_classification(target uuid) returns text language sql stable security definer set search_path='' as $$
 select outcome from (
  select outcome,recorded_at,id::text tie from public.decision where lot_id=target
  union all select coalesce(changes->>'decision',changes->>'state'),recorded_at,id::text from public.amendment where object_id=target and coalesce(changes->>'decision',changes->>'state') in ('accepted','hold','rejected')
  union all select state,observed_at,id::text from public.lot_state_event where lot_id=target and state in ('received','accepted','hold','rejected')
 ) classifications order by recorded_at desc,tie desc limit 1;
$$;
revoke all on function private.whey_classification(uuid) from public,anon,authenticated;

create or replace function private.impact_completeness(period_start timestamptz,period_end timestamptz,scope uuid) returns numeric language plpgsql stable security definer set search_path='' as $$
declare batch record;cp jsonb;started timestamptz;ended timestamptz;first_due timestamptz;interval_seconds numeric;due_count bigint:=0;completed_count bigint:=0;slots integer;completed integer;due timestamptz;
begin
 for batch in select l.*,cv.definition from public.lot l join public.config_version cv on cv.id=l.config_version_id where l.type='batch' and l.observed_at<period_end and l.state<>'draft' and not coalesce((l.facts->>'test_data')::boolean,false) and (scope is null or l.cooperative_id=scope) loop
  for cp in select value from jsonb_array_elements(coalesce(batch.definition->'checkpoints','[]')) where coalesce((value->>'required')::boolean,false) loop
   select min(observed_at) into started from public.stage_event where lot_id=batch.id and stage=cp->>'stage' and observed_at<period_end;
   if started is null then continue;end if;
   select least(period_end,coalesce((select min(observed_at) from public.stage_event where lot_id=batch.id and stage<>cp->>'stage' and observed_at>started),period_end),coalesce((select min(observed_at) from public.lot_state_event where lot_id=batch.id and state in ('released','rejected','closed') and observed_at>started),period_end)) into ended;
   first_due:=started+make_interval(secs=>coalesce((cp->>'offset_hours')::numeric,0)*3600);
   interval_seconds:=coalesce((cp->>'interval_hours')::numeric,0)*3600;
   slots:=case when interval_seconds>0 then greatest(0,ceil(extract(epoch from ended-first_due)/interval_seconds)::integer) when first_due<ended then 1 else 0 end;
   if slots>100000 then raise exception 'Reporting period has too many checkpoint intervals';end if;
   if slots>0 then for slot in 0..slots-1 loop
    due:=first_due+make_interval(secs=>slot*interval_seconds);if due<period_start or due>=period_end then continue;end if;due_count:=due_count+1;
    select count(*) into completed from public.operational_record r where r.lot_id=batch.id and r.definition_key=cp->>'key' and r.observed_at>=started and r.observed_at<ended and (case when interval_seconds>0 then greatest(0,floor(extract(epoch from r.observed_at-first_due)/interval_seconds))=slot else r.observed_at>=started end) and (not coalesce((cp->>'required_photo')::boolean,false) or exists(select 1 from public.attachment a where a.record_id=r.id));
    if completed>0 then completed_count:=completed_count+1;end if;
   end loop;end if;
  end loop;
 end loop;
 return 100.0*completed_count/nullif(due_count,0);
end $$;
revoke all on function private.impact_completeness(timestamptz,timestamptz,uuid) from public,anon,authenticated;

create or replace function private.impact_metrics(from_date date,to_date date) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.membership;scope uuid;period_start timestamptz:=from_date::timestamp at time zone 'Asia/Beirut';period_end timestamptz:=(to_date+1)::timestamp at time zone 'Asia/Beirut';participants integer;received numeric;accepted numeric;valorized numeric;packaged numeric;yield_output numeric;whey_input numeric;sales_value numeric;sold numeric;active_producers numeric;trained_producers numeric;completeness numeric;open_critical numeric;mock_minutes numeric;k record;metric numeric;
begin
 select * into m from public.membership where user_id=wise_auth.uid() and status='active';
 if m.user_id is null or not private.has_role(array['manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 scope:=case when m.roles&&array['admin','food_safety','partner','donor'] then null else m.cooperative_id end;
 select count(distinct activity.author) into active_producers from (
  select producer_id author,cooperative_id,observed_at from public.lot where type='batch' and not coalesce((facts->>'test_data')::boolean,false)
  union all select r.author_id,r.cooperative_id,r.observed_at from public.operational_record r left join public.lot l on l.id=r.lot_id where not coalesce((r.payload->>'test_data')::boolean,false) and not coalesce((l.facts->>'test_data')::boolean,false)
  union all select c.author_id,c.cooperative_id,c.observed_at from public.consumption c join public.lot l on l.id=c.output_lot_id join public.lot i on i.id=c.input_lot_id where not coalesce((l.facts->>'test_data')::boolean,false) and not coalesce((i.facts->>'test_data')::boolean,false)
 ) activity join public.membership member on member.user_id=activity.author where member.status='active' and 'producer'=any(member.roles) and not coalesce((member.authorizations->>'test_data')::boolean,false) and activity.observed_at>=period_start and activity.observed_at<period_end and (scope is null or activity.cooperative_id=scope);
 participants:=active_producers;
 select coalesce(sum(l.initial_quantity),0),coalesce(sum(l.initial_quantity) filter(where private.whey_classification(l.id)='accepted'),0) into received,accepted from public.lot l where l.type='whey' and l.unit='kg' and not coalesce((l.facts->>'test_data')::boolean,false) and (scope is null or l.cooperative_id=scope) and l.observed_at>=period_start and l.observed_at<period_end;
 select coalesce(sum(c.quantity),0) into valorized from public.consumption c join public.lot i on i.id=c.input_lot_id join public.lot o on o.id=c.output_lot_id where i.type='whey' and c.unit='kg' and private.whey_classification(i.id)='accepted' and o.type='batch' and o.state<>'rejected' and exists(select 1 from public.lot_state_event se where se.lot_id=o.id and se.state='released') and not coalesce((i.facts->>'test_data')::boolean,false) and not coalesce((o.facts->>'test_data')::boolean,false) and (scope is null or c.cooperative_id=scope) and c.observed_at>=period_start and c.observed_at<period_end;
 select coalesce(sum(p.mass_kg),0) into packaged from public.packaging_detail p join public.lot b on b.id=p.batch_id join public.lot pl on pl.id=p.lot_id where b.state<>'rejected' and not coalesce((b.facts->>'test_data')::boolean,false) and (scope is null or p.cooperative_id=scope) and pl.observed_at>=period_start and pl.observed_at<period_end;
 with complete_batches as (
  select b.id from public.lot b where b.type='batch' and b.state<>'rejected' and not coalesce((b.facts->>'test_data')::boolean,false) and (scope is null or b.cooperative_id=scope) and exists(select 1 from public.consumption c join public.lot i on i.id=c.input_lot_id where c.output_lot_id=b.id and i.type='whey' and c.unit='kg') and not exists(select 1 from public.task t where t.lot_id=b.id and t.status='open' and t.kind='sync_conflict')
 ), outputs as (select p.batch_id,sum(p.mass_kg) mass from public.packaging_detail p join public.lot pl on pl.id=p.lot_id where p.batch_id in(select id from complete_batches) and pl.observed_at>=period_start and pl.observed_at<period_end group by p.batch_id)
 select coalesce(sum(outputs.mass),0),coalesce(sum((select sum(c.quantity) from public.consumption c join public.lot i on i.id=c.input_lot_id where c.output_lot_id=outputs.batch_id and i.type='whey' and c.unit='kg')),0) into yield_output,whey_input from outputs;
 select coalesce(sum(s.total/s.usd_rate),0),coalesce(sum(s.quantity),0) into sales_value,sold from public.sale s join public.lot pl on pl.id=s.packaging_lot_id join public.packaging_detail pd on pd.lot_id=pl.id join public.lot b on b.id=pd.batch_id where s.transaction_type='sale' and not coalesce((b.facts->>'test_data')::boolean,false) and not coalesce((pl.facts->>'test_data')::boolean,false) and (scope is null or s.cooperative_id=scope) and s.observed_at>=period_start and s.observed_at<period_end;
 select count(*) into trained_producers from public.membership member join lateral(select cv.id from public.config_version cv where cv.kind='sop' and cv.status='approved' and cv.effective_at<period_end and (cv.cooperative_id is null or cv.cooperative_id=member.cooperative_id) order by (cv.cooperative_id is not null) desc,cv.version desc limit 1) current_config on true where member.status='active' and 'producer'=any(member.roles) and not coalesce((member.authorizations->>'test_data')::boolean,false) and (scope is null or member.cooperative_id=scope) and exists(select 1 from public.training_module tm where tm.config_version_id=current_config.id and tm.required and tm.effective_at<period_end) and not exists(select 1 from public.training_module tm where tm.config_version_id=current_config.id and tm.required and tm.effective_at<period_end and not exists(select 1 from public.training_module newer where newer.config_version_id=tm.config_version_id and newer.module_key=tm.module_key and newer.version>tm.version and newer.effective_at<period_end) and not exists(select 1 from public.training_completion tc where tc.user_id=member.user_id and tc.module_id=tm.id and tc.completed_at<period_end and (tc.expires_at is null or tc.expires_at>=period_end)));
 completeness:=private.impact_completeness(period_start,period_end,scope);
 select count(*) into open_critical from public.deviation d left join public.lot l on l.id=d.lot_id where d.severity='critical' and d.observed_at<period_end and (d.closed_at is null or d.closed_at>=period_end) and not coalesce((l.facts->>'test_data')::boolean,false) and (scope is null or d.cooperative_id=scope);
 select avg(extract(epoch from completed_at-started_at)/60) into mock_minutes from public.recall where mock and completed_at>=period_start and completed_at<period_end and (scope is null or cooperative_id=scope);
 for k in select * from public.kpi_definition where not('donor'=any(m.roles)) or visibility like '%donor%' order by id loop
  metric:=case k.id when 'KPI-01' then received when 'KPI-02' then accepted when 'KPI-03' then valorized when 'KPI-04' then 100*valorized/nullif(accepted,0) when 'KPI-05' then packaged when 'KPI-06' then yield_output/nullif(whey_input,0) when 'KPI-07' then active_producers when 'KPI-08' then trained_producers when 'KPI-09' then completeness when 'KPI-10' then sales_value when 'KPI-11' then sold when 'KPI-12' then open_critical when 'KPI-13' then mock_minutes else null end;
  return next jsonb_build_object('id',k.id,'label',k.label,'definition',k.definition,'source',k.source,'calculation',k.calculation,'exclusions',k.exclusions,'value',case when 'donor'=any(m.roles) and participants<5 then null else metric end,'suppressed',('donor'=any(m.roles) and participants<5),'unit',case when k.id in ('KPI-01','KPI-02','KPI-03','KPI-05') then 'kg' when k.id in ('KPI-04','KPI-09') then '%' when k.id='KPI-10' then 'USD' when k.id='KPI-13' then 'min' else '' end);
 end loop;
end $$;
revoke all on function private.impact_metrics(date,date) from public,anon,authenticated;
