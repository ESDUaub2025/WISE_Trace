begin;
set local search_path=public,extensions;
select no_plan();
create temporary table yield_fixture(batch uuid);
insert into yield_fixture values(gen_random_uuid());
grant select on yield_fixture to authenticated;
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,stage)
select batch,'10000000-0000-4000-8000-000000000001','batch','YIELD-'||batch,'in_production','kg',0,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',now(),'packing' from yield_fixture;
insert into public.consumption values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',(select batch from yield_fixture),2,'kg','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now(),now(),'Yield fixture');
create function pg_temp.yield_sync(reason text) returns jsonb language sql as $$
 select public.apply_sync(jsonb_build_object('id',gen_random_uuid(),'cooperative_id','10000000-0000-4000-8000-000000000001','author_id','20000000-0000-4000-8000-000000000001','device_id','30000000-0000-4000-8000-000000000001','config_version_id','40000000-0000-4000-8000-000000000001','action','packaging','observed_at',now(),'payload',jsonb_build_object('batch_id',(select batch from yield_fixture),'packaging_material_id','60000000-0000-4000-8000-000000000004','package_type','kraft','size_kg',5,'package_count',1,'best_before',(current_date+30)::text,'storage_location','Dry store','reason',reason)));
$$;
grant execute on function pg_temp.yield_sync(text) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select is(pg_temp.yield_sync('')->>'status','conflict','Out-of-range packaging yield needs an attributed justification');
select is((select count(*)::integer from public.packaging_detail where batch_id=(select batch from yield_fixture)),0,'Failed yield check rolls back the packaging session');
select is(pg_temp.yield_sync('Confirmed exceptional output during investigation')->>'status','synced','Configured warning permits a justified packaging session');
select is((select (detected_value->>'ratio')::numeric from public.deviation where lot_id=(select batch from yield_fixture) and category='packaging_yield'),2.5::numeric,'Yield review retains input mass, output mass and ratio');
select ok(exists(select 1 from public.task where lot_id=(select batch from yield_fixture) and details->>'reason'='packaging_yield'),'Yield warning creates a review task');
select * from finish();
rollback;
