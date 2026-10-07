begin;
set local search_path=public,extensions;
select no_plan();
create temporary table clock_fixture(id uuid,client_time timestamptz);
insert into clock_fixture values(gen_random_uuid(),now()+interval '2 minutes');
grant select on clock_fixture to authenticated;
insert into public.lot(id,cooperative_id,type,code,state,stage,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at)
 select id,'10000000-0000-4000-8000-000000000001','batch','CLOCK-'||id,'draft','preparation','kg',0,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',now() from clock_fixture;
insert into public.operational_record(id,cooperative_id,lot_id,kind,definition_key,config_version_id,payload,author_id,device_id,observed_at)
 select gen_random_uuid(),'10000000-0000-4000-8000-000000000001',id,'checkpoint','hygiene','40000000-0000-4000-8000-000000000001','{"all_ok":true}','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now()+interval '100 milliseconds' from clock_fixture;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select public.advance_stage((select id from clock_fixture),'mixing');
select ok((select s.observed_at>r.observed_at from public.stage_event s join public.operational_record r on r.lot_id=s.lot_id where s.lot_id=(select id from clock_fixture) and s.stage='mixing' and r.definition_key='hygiene'),'Generated online boundary includes a valid slightly-ahead device reading');
select is((select public.apply_sync(jsonb_build_object('id',gen_random_uuid(),'author_id','20000000-0000-4000-8000-000000000001','cooperative_id','10000000-0000-4000-8000-000000000001','device_id','30000000-0000-4000-8000-000000000001','config_version_id','40000000-0000-4000-8000-000000000001','action','stage','observed_at',client_time,'payload',jsonb_build_object('lot_id',id,'next_stage','fermentation')))->>'status' from clock_fixture),'synced','Explicit offline transition still synchronizes');
select is((select observed_at from public.stage_event where lot_id=(select id from clock_fixture) and stage='fermentation'),(select client_time from clock_fixture),'Explicit offline stage time remains unchanged');
select * from finish();
rollback;
