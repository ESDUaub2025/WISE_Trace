begin;
set local search_path=public,extensions;
select no_plan();
create temporary table dashboard_fixture(lot_id uuid,device_id uuid,coop uuid,producer uuid,quantity numeric);
insert into dashboard_fixture values
 (gen_random_uuid(),gen_random_uuid(),'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',17),
 (gen_random_uuid(),gen_random_uuid(),'10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000008',23);
insert into public.device(id,cooperative_id,label,registered_by) select device_id,coop,'Dashboard fixture',producer from dashboard_fixture;
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,generation_at)
 select lot_id,coop,'whey','FILTER-'||lot_id,'received','kg',quantity,producer,device_id,'40000000-0000-4000-8000-000000000001','1998-01-01T12:00Z','1998-01-01T10:00Z' from dashboard_fixture;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select is((select (metric->>'value')::numeric from public.impact_metrics_filtered('1998-01-01','1998-01-02',null,null) metric where metric->>'id'='KPI-01'),40::numeric,'Global impact includes both cooperatives');
select is((select (metric->>'value')::numeric from public.impact_metrics_filtered('1998-01-01','1998-01-02','10000000-0000-4000-8000-000000000002',null) metric where metric->>'id'='KPI-01'),23::numeric,'Cooperative filter changes authoritative impact mass');
select is((select (metric->>'value')::numeric from public.impact_metrics_filtered('1998-01-01','1998-01-02',null,'Akkar') metric where metric->>'id'='KPI-01'),17::numeric,'Region filter changes authoritative impact mass');
select is((select (metric->>'value')::numeric from public.impact_metrics_filtered('1998-01-01','1998-01-02','10000000-0000-4000-8000-000000000002','Akkar') metric where metric->>'id'='KPI-01'),0::numeric,'Cooperative and region filters intersect');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select is((select count(*) from public.dashboard_cooperatives()),1::bigint,'Manager selector exposes only the authorized cooperative');
select throws_ok($$select * from public.impact_metrics_filtered('1998-01-01','1998-01-02','10000000-0000-4000-8000-000000000002',null)$$,'P0001','Cooperative outside dashboard scope','Manager cannot request another cooperative');
select is((select (metric->>'value')::numeric from public.impact_metrics_filtered('1998-01-01','1998-01-02',null,null) metric where metric->>'id'='KPI-01'),17::numeric,'Manager all-cooperatives filter stays scoped');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal1"}',true);
select ok((select bool_and((metric->>'suppressed')::boolean and metric->'value'='null'::jsonb) from public.impact_metrics_filtered('1998-01-01','1998-01-02','10000000-0000-4000-8000-000000000002',null) metric),'Filtered donor cells retain small-group suppression');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select * from public.dashboard_cooperatives()$$,'P0001','Dashboard permission required','Producer cannot enumerate project dashboard scope');
select * from finish();
rollback;
