begin;
set local search_path=public,extensions;
select no_plan();
create temporary table reception_fixture(config uuid,equipment uuid);
insert into reception_fixture values(gen_random_uuid(),gen_random_uuid());
grant select on reception_fixture to authenticated;
insert into public.config_version(id,cooperative_id,kind,version,effective_at,status,definition)
select config,'10000000-0000-4000-8000-000000000001','sop',101,now()-interval '1 day','approved','{"reception_measurements":[{"key":"brix","unit":"Brix","required":true,"min_plausible":0,"max_plausible":100}]}' from reception_fixture;
insert into public.equipment(id,cooperative_id,label,type,status,next_due_at)
select equipment,'10000000-0000-4000-8000-000000000002','Other cooperative instrument','refractometer','active',now()+interval '1 day' from reception_fixture;
create function pg_temp.reception_sync(facts jsonb) returns jsonb language sql as $$
 select public.apply_sync(jsonb_build_object('id',gen_random_uuid(),'cooperative_id','10000000-0000-4000-8000-000000000001','author_id','20000000-0000-4000-8000-000000000001','device_id','30000000-0000-4000-8000-000000000001','config_version_id',(select config from reception_fixture),'action','receipt','observed_at',now(),'payload',jsonb_build_object('type','whey','supplier_id','50000000-0000-4000-8000-000000000001','quantity',5,'unit','kg','generation_at',now()-interval '1 hour','facts',facts)));
$$;
grant execute on function pg_temp.reception_sync(jsonb) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select is(pg_temp.reception_sync('{"brix":9999}')->>'status','conflict','Physical plausibility is enforced on the server');
select is(pg_temp.reception_sync(jsonb_build_object('brix',8,'measurements',jsonb_build_array(jsonb_build_object('key','brix','value',8,'unit','Brix','observed_at',now(),'user_id','20000000-0000-4000-8000-000000000002'))))->>'status','conflict','Receipt cannot claim another person measured it');
select is(pg_temp.reception_sync(jsonb_build_object('brix',8,'measurements',jsonb_build_array(jsonb_build_object('key','brix','value',8,'unit','kg','observed_at',now(),'user_id','20000000-0000-4000-8000-000000000001'))))->>'status','conflict','Receipt preserves the configured measurement unit');
select is(pg_temp.reception_sync(jsonb_build_object('brix',8,'measurements',jsonb_build_array(jsonb_build_object('key','brix','value',8,'unit','Brix','observed_at',now(),'user_id','20000000-0000-4000-8000-000000000001','equipment_id',(select equipment from reception_fixture)))))->>'status','conflict','Receipt cannot use another cooperative instrument');
select is(pg_temp.reception_sync(jsonb_build_object('brix',8,'measurements',jsonb_build_array(jsonb_build_object('key','brix','value',8,'unit','Brix','observed_at',now(),'user_id','20000000-0000-4000-8000-000000000001'))))->>'status','synced','Configured reading retains unit, time and author');
select * from finish();
rollback;
