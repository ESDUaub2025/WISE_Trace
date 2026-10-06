begin;
set local search_path=public,extensions;
select no_plan();
create temporary table impact_fixture(id uuid);
insert into impact_fixture values(gen_random_uuid());
grant select on impact_fixture to authenticated;
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,generation_at,facts)
select id,'10000000-0000-4000-8000-000000000001','whey','KPI-TEST-'||id,'accepted','kg',999,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2000-01-01T12:00Z','2000-01-01T10:00Z','{"test_data":true}' from impact_fixture;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select is((select (metric->>'value')::numeric from public.impact_metrics('2000-01-01','2000-01-02') metric where metric->>'id'='KPI-01'),0::numeric,'Test whey cannot inflate received impact mass');
select is((select (metric->>'value')::numeric from public.impact_metrics('2000-01-01','2000-01-02') metric where metric->>'id'='KPI-02'),0::numeric,'Test whey cannot inflate accepted impact mass');
select ok((select metric->'value'='null'::jsonb from public.impact_metrics('2090-01-01','2090-01-02') metric where metric->>'id'='KPI-04'),'Undefined utilization remains null when the denominator is zero');
select is((select metric->>'unit' from public.impact_metrics('2026-01-01','2026-12-31') metric where metric->>'id'='KPI-01'),'kg','Mass indicators report their units');
select is((select metric->>'unit' from public.impact_metrics('2026-01-01','2026-12-31') metric where metric->>'id'='KPI-10'),'USD','Gross sales are explicitly USD');
select is((select metric->>'unit' from public.impact_metrics('2026-01-01','2026-12-31') metric where metric->>'id'='KPI-13'),'min','Mock recall time reports minutes');
select ok((select bool_and(metric ? 'exclusions' and metric ? 'calculation' and metric ? 'source') from public.impact_metrics('2026-01-01','2026-12-31') metric),'Every indicator includes its source, calculation and exclusions');
select * from finish();
rollback;
