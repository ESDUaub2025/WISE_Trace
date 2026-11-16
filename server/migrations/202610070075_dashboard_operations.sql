create or replace function public.operational_dashboard(from_date date,to_date date,cooperative_filter uuid default null,region_filter text default null,status_filter text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.has_role(array['supervisor','manager','admin','food_safety','partner']) then raise exception 'Operational dashboard permission required';end if;
 if from_date>to_date then raise exception 'Invalid reporting period';end if;
 if cooperative_filter is not null and not (private.has_role(array['admin','food_safety','partner']) or private.can_read(cooperative_filter)) then raise exception 'Cooperative outside dashboard scope';end if;
 with scope as (select id,name,region from public.cooperative where (private.has_role(array['admin','food_safety','partner']) or private.can_read(id)) and (cooperative_filter is null or id=cooperative_filter) and (region_filter is null or region=region_filter)),
 batches as (select l.* from public.lot l join scope s on s.id=l.cooperative_id where l.type='batch' and l.observed_at>=from_date::timestamp at time zone 'Asia/Beirut' and l.observed_at<(to_date+1)::timestamp at time zone 'Asia/Beirut' and (status_filter is null or l.state=status_filter) and not coalesce((l.facts->>'test_data')::boolean,false)),
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
 from scope s), monthly as (select to_char(observed_at at time zone 'Asia/Beirut','YYYY-MM') as "month",count(*) batches from batches group by 1 order by 1)
 select jsonb_build_object('cooperatives',coalesce((select jsonb_agg(s) from summaries s),'[]'::jsonb),'monthly',coalesce((select jsonb_agg(m) from monthly m),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.operational_dashboard(date,date,uuid,text,text) from public,anon;
grant execute on function public.operational_dashboard(date,date,uuid,text,text) to authenticated;

create or replace function public.dashboard_cooperatives() returns table(id uuid,name text,region text) language plpgsql stable security definer set search_path='' as $$
declare member public.membership;begin
 select * into member from public.membership where user_id=wise_auth.uid() and status='active';
 if member.user_id is null or not private.has_role(array['supervisor','manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 return query select c.id,c.name,c.region from public.cooperative c where member.roles&&array['admin','food_safety','partner','donor'] or c.id=member.cooperative_id order by c.name;
end $$;
