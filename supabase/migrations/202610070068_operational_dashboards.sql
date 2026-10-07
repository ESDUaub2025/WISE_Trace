create function public.operational_dashboard(from_date date,to_date date,cooperative_filter uuid default null,region_filter text default null,status_filter text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if not private.has_role(array['manager','admin','food_safety','partner']) then raise exception 'Operational dashboard permission required';end if;
 if from_date>to_date then raise exception 'Invalid reporting period';end if;
 if cooperative_filter is not null and not private.can_read(cooperative_filter) then raise exception 'Cooperative outside dashboard scope';end if;
 with scope as (select id,name,region from public.cooperative where (cooperative_filter is null or id=cooperative_filter) and (region_filter is null or region=region_filter)),
 batches as (select l.* from public.lot l join scope s on s.id=l.cooperative_id where l.type='batch' and l.observed_at>=from_date::timestamp at time zone 'Asia/Beirut' and l.observed_at<(to_date+1)::timestamp at time zone 'Asia/Beirut' and (status_filter is null or l.state=status_filter) and not coalesce((l.facts->>'test_data')::boolean,false)),
 summaries as (select s.id,s.name,s.region,
 (select count(*) from batches b where b.cooperative_id=s.id) batches,
 (select count(*) from batches b where b.cooperative_id=s.id and b.state in ('awaiting_review','on_hold')) pending_reviews,
 (select count(*) from public.deviation d where d.cooperative_id=s.id and d.closed_at is null and (status_filter is null or d.lot_id in(select id from batches))) open_deviations,
 (select count(*) from public.task t where t.cooperative_id=s.id and t.status='open' and t.due_at<now()) overdue_tasks,
 (select coalesce(sum(public.lot_available(l.id)),0) from public.lot l join public.packaging_detail p on p.lot_id=l.id where l.cooperative_id=s.id and l.state='released' and (status_filter is null or p.batch_id in(select id from batches))) stock_units,
 (select count(distinct tc.user_id) from public.training_completion tc where tc.cooperative_id=s.id and tc.completed_at>=from_date::timestamp at time zone 'Asia/Beirut' and tc.completed_at<(to_date+1)::timestamp at time zone 'Asia/Beirut' and (tc.expires_at is null or tc.expires_at>now())) trained_producers
 from scope s), monthly as (select to_char(observed_at at time zone 'Asia/Beirut','YYYY-MM') as "month",count(*) batches from batches group by 1 order by 1)
 select jsonb_build_object('cooperatives',coalesce((select jsonb_agg(s) from summaries s),'[]'::jsonb),'monthly',coalesce((select jsonb_agg(m) from monthly m),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.operational_dashboard(date,date,uuid,text,text) from public,anon;
grant execute on function public.operational_dashboard(date,date,uuid,text,text) to authenticated;
