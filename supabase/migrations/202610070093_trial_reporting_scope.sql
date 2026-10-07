-- Trial activity stays in its own workspace reports and out of production aggregates.

create or replace function public.impact_metrics_cohort(from_date date,to_date date,cooperative_filter uuid,region_filter text,status_filter text,product_filter text) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.membership;scope uuid[];begin
 select * into m from public.membership where user_id=auth.uid() and status='active';
 if m.user_id is null or not private.has_role(array['manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 if from_date>to_date then raise exception 'Invalid reporting period';end if;
 if not(m.roles&&array['admin','food_safety','partner','donor']) and cooperative_filter is not null and cooperative_filter<>m.cooperative_id then raise exception 'Cooperative outside dashboard scope';end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into scope from public.cooperative where (service_plan='full' or id=m.cooperative_id) and (m.roles&&array['admin','food_safety','partner','donor'] or id=m.cooperative_id) and (cooperative_filter is null or id=cooperative_filter) and (region_filter is null or region=region_filter);
 return query select * from private.impact_metrics_core(from_date,to_date,scope,'donor'=any(m.roles),nullif(status_filter,''),nullif(product_filter,''));
end $$;

create or replace function private.impact_metrics_filtered(from_date date,to_date date,cooperative_filter uuid,region_filter text) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.membership;scope uuid[];begin
 select * into m from public.membership where user_id=auth.uid() and status='active';
 if m.user_id is null or not private.has_role(array['manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 if not(m.roles&&array['admin','food_safety','partner','donor']) and cooperative_filter is not null and cooperative_filter is distinct from m.cooperative_id then raise exception 'Cooperative outside dashboard scope';end if;
 select coalesce(array_agg(c.id),'{}'::uuid[]) into scope from public.cooperative c where (c.service_plan='full' or c.id=m.cooperative_id) and (m.roles&&array['admin','food_safety','partner','donor'] or c.id=m.cooperative_id) and (cooperative_filter is null or c.id=cooperative_filter) and (region_filter is null or c.region=region_filter);
 return query select * from private.impact_metrics_core(from_date,to_date,scope,'donor'=any(m.roles));
end $$;

create or replace function public.dashboard_cooperatives() returns table(id uuid,name text,region text) language plpgsql stable security definer set search_path='' as $$
declare member public.membership;
begin
 select * into member from public.membership where user_id=auth.uid() and status='active';
 if member.user_id is null or not private.has_role(array['manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 return query select c.id,c.name,c.region from public.cooperative c where (c.service_plan='full' or c.id=member.cooperative_id) and (member.roles&&array['admin','food_safety','partner','donor'] or c.id=member.cooperative_id) order by c.name;
end $$;

create or replace function public.participation_demographics(cooperative_filter uuid,region_filter text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.membership;result jsonb;begin
 select * into m from public.membership where user_id=auth.uid() and status='active';
 if m.user_id is null or not private.has_role(array['manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 if not(m.roles&&array['admin','food_safety','partner','donor']) and cooperative_filter is not null and cooperative_filter<>m.cooperative_id then raise exception 'Cooperative outside dashboard scope';end if;
 with consenting as (select p.sex,p.age_band from public.producer_profile p join public.membership u on u.user_id=p.user_id join public.cooperative c on c.id=u.cooperative_id where (c.service_plan='full' or c.id=m.cooperative_id) and p.consent_at is not null and p.withdrawn_at is null and u.status='active' and 'producer'=any(u.roles) and not coalesce((u.authorizations->>'test_data')::boolean,false) and (m.roles&&array['admin','food_safety','partner','donor'] or u.cooperative_id=m.cooperative_id) and (cooperative_filter is null or u.cooperative_id=cooperative_filter) and (region_filter is null or c.region=region_filter)), groups as (
 select 'sex' dimension,case when sex in ('female','male') then sex else 'other' end category,count(*) count from consenting where sex is not null group by 2
 union all select 'age_band',case when age_band in ('18-24','25-34','35-44','45-54','55-64','65+') then age_band else 'other' end,count(*) from consenting where age_band is not null group by 2)
 select coalesce(jsonb_agg(jsonb_build_object('dimension',dimension,'category',category,'value',case when count>=5 then count else null end,'suppressed',count<5)),'[]') into result from groups;
 return result;
end $$;

create or replace function public.operational_dashboard(from_date date,to_date date,cooperative_filter uuid,region_filter text,status_filter text,product_filter text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.has_role(array['supervisor','manager','admin','food_safety','partner']) then raise exception 'Operational dashboard permission required';end if;
 if from_date>to_date then raise exception 'Invalid reporting period';end if;
 if cooperative_filter is not null and not (private.has_role(array['admin','food_safety','partner']) or private.can_read(cooperative_filter)) then raise exception 'Cooperative outside dashboard scope';end if;
 with scope as (select id,name,region from public.cooperative where (service_plan='full' or id=(select cooperative_id from public.membership where user_id=auth.uid())) and (private.has_role(array['admin','food_safety','partner']) or private.can_read(id)) and (cooperative_filter is null or id=cooperative_filter) and (region_filter is null or region=region_filter)),
 batches as (select l.* from public.lot l join scope s on s.id=l.cooperative_id where private.metric_cohort_match(l.id,status_filter,product_filter) and l.type='batch' and l.observed_at>=from_date::timestamp at time zone 'Asia/Beirut' and l.observed_at<(to_date+1)::timestamp at time zone 'Asia/Beirut' and (status_filter is null or l.state=status_filter) and not coalesce((l.facts->>'test_data')::boolean,false)),
 summaries as (select s.id,s.name,s.region,
 (select count(*) from batches b where b.cooperative_id=s.id) batches,
 (select count(*) from batches b where b.cooperative_id=s.id and b.state in ('awaiting_review','on_hold')) pending_reviews,
 (select count(*) from public.deviation d where d.cooperative_id=s.id and d.closed_at is null and (status_filter is null or d.lot_id in(select id from batches))) open_deviations,
 (select count(*) from public.task t where t.cooperative_id=s.id and t.status='open' and t.due_at<now()) overdue_tasks,
 (select coalesce(sum(public.lot_available(l.id)),0) from public.lot l join public.packaging_detail p on p.lot_id=l.id where l.cooperative_id=s.id and l.state='released' and (status_filter is null or p.batch_id in(select id from batches))) stock_units,
 (select count(distinct tc.user_id) from public.training_completion tc where tc.cooperative_id=s.id and tc.completed_at>=from_date::timestamp at time zone 'Asia/Beirut' and tc.completed_at<(to_date+1)::timestamp at time zone 'Asia/Beirut' and (tc.expires_at is null or tc.expires_at>now())) trained_producers
  ,(select count(*) from public.membership m where m.cooperative_id=s.id and m.status='active' and 'producer'=any(m.roles) and not coalesce((m.authorizations->>'test_data')::boolean,false)) registered_producers
 ,(select count(*) from public.lot l where l.cooperative_id=s.id and l.type='whey' and l.state in ('received','hold')) awaiting_decision
 ,(select count(*) from public.lot l where l.cooperative_id=s.id and l.type='whey' and l.state='accepted' and l.expires_at between now() and now()+interval '24 hours' and public.lot_available(l.id)>0) expiring_whey
 ,(select count(*) from public.equipment e where e.cooperative_id=s.id and e.status='active' and e.next_due_at<=now()+interval '7 days') calibration_due
 ,(select count(*) from public.operational_record r where r.cooperative_id=s.id and r.late and r.observed_at>=from_date::timestamp at time zone 'Asia/Beirut' and r.observed_at<(to_date+1)::timestamp at time zone 'Asia/Beirut') late_records
 ,(select count(*) from public.sync_receipt r where r.cooperative_id=s.id and r.status='conflict' and r.observed_at>=from_date::timestamp at time zone 'Asia/Beirut' and r.observed_at<(to_date+1)::timestamp at time zone 'Asia/Beirut') sync_conflicts
 ,(select count(*) from public.device d where d.cooperative_id=s.id and d.revoked_at is null and (d.last_sync_at is null or d.last_sync_at<now()-interval '1 day')) stale_devices
 ,(select count(*) from public.deviation d where d.cooperative_id=s.id and d.category='reception_override' and d.observed_at>=from_date::timestamp at time zone 'Asia/Beirut' and d.observed_at<(to_date+1)::timestamp at time zone 'Asia/Beirut') warnings_overridden
 from scope s), monthly as (select to_char(observed_at at time zone 'Asia/Beirut','YYYY-MM') as "month",count(*) batches from batches group by 1 order by 1)
 select jsonb_build_object('cooperatives',coalesce((select jsonb_agg(s) from summaries s),'[]'::jsonb),'monthly',coalesce((select jsonb_agg(m) from monthly m),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.claim_monthly_reports() returns setof jsonb language plpgsql security definer set search_path='' as $$
declare job record;scope uuid[];metrics jsonb;operations jsonb;period_start date:=(date_trunc('month',now() at time zone 'Asia/Beirut')-interval '1 month')::date;begin
 insert into public.report_delivery(schedule_id,period) select id,period_start from public.report_schedule where enabled on conflict do nothing;
 for job in select q.*,s.recipients,s.cooperative_id from public.report_delivery q join public.report_schedule s on s.id=q.schedule_id join public.membership m on m.user_id=s.created_by where s.enabled and m.status='active' and (m.roles&&array['admin'] or m.roles&&array['manager'] and m.cooperative_id=s.cooperative_id) and q.status in ('pending','sending','failed') and q.attempts<5 and q.next_attempt_at<=now() order by q.period limit 10 for update of q skip locked loop
 select array_agg(id) into scope from public.cooperative where (service_plan='full' or id=job.cooperative_id) and (job.cooperative_id is null or id=job.cooperative_id);
 select coalesce(jsonb_agg(metric),'[]') into metrics from private.impact_metrics_core(job.period,(job.period+interval '1 month'-interval '1 day')::date,scope,true) metric;
 select coalesce(jsonb_agg(row),'[]') into operations from (select c.name cooperative,c.region,(select count(*) from public.lot l where l.cooperative_id=c.id and l.type='batch' and l.observed_at>=job.period::timestamp at time zone 'Asia/Beirut' and l.observed_at<(job.period+interval '1 month') at time zone 'Asia/Beirut' and not coalesce((l.facts->>'test_data')::boolean,false)) batches,(select count(*) from public.deviation d where d.cooperative_id=c.id and d.closed_at is null) open_deviations from public.cooperative c where c.id=any(scope)) row;
 update public.report_delivery set status='sending',attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' where schedule_id=job.schedule_id and period=job.period;
 return next jsonb_build_object('schedule_id',job.schedule_id,'period',job.period,'recipients',job.recipients,'impact',metrics,'operations',operations);
 end loop;
end $$;
