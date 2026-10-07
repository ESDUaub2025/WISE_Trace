begin;
set local search_path=public,extensions;
select no_plan();
create temporary table creation_fixture(config uuid);
insert into creation_fixture values(gen_random_uuid());
grant select on creation_fixture to authenticated;
insert into public.config_version(id,cooperative_id,kind,version,effective_at,status,definition)
select f.config,'10000000-0000-4000-8000-000000000001','sop',9999999,now()-interval '1 minute','approved',c.definition from creation_fixture f cross join public.config_version c where c.id='40000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','batch','STALE-SOP','draft','kg',0,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',now())$$,'42501',null,'Direct table writes remain forbidden');
select is(public.apply_sync(jsonb_build_object('id',gen_random_uuid(),'cooperative_id','10000000-0000-4000-8000-000000000001','author_id','20000000-0000-4000-8000-000000000001','device_id','30000000-0000-4000-8000-000000000001','config_version_id','40000000-0000-4000-8000-000000000001','observed_at',now(),'action','receipt','payload',jsonb_build_object('type','ingredient','supplier_id','50000000-0000-4000-8000-000000000002','quantity',1,'unit','kg')))->>'status','conflict','Old SOP receipt becomes a retained conflict rather than silently switching version');
select is(public.apply_sync(jsonb_build_object('id',gen_random_uuid(),'cooperative_id','10000000-0000-4000-8000-000000000001','author_id','20000000-0000-4000-8000-000000000001','device_id','30000000-0000-4000-8000-000000000001','config_version_id','40000000-0000-4000-8000-000000000001','observed_at',now(),'action','note','payload',jsonb_build_object('lot_id','60000000-0000-4000-8000-000000000010','values',jsonb_build_object('note','Original SOP evidence preserved'))))->>'status','synced','Existing batches retain their original SOP for new evidence');
select * from finish();rollback;
