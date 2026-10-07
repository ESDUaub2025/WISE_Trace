begin;
set local search_path=public,extensions;
select no_plan();
create temporary table cache_fixture(closed uuid,active uuid);
insert into cache_fixture values(gen_random_uuid(),gen_random_uuid());
grant select on cache_fixture to authenticated;
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,stage)
select closed,'10000000-0000-4000-8000-000000000001','batch','ARCHIVE-CLOSED','closed','kg',0,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',now()-interval '200 days','prep' from cache_fixture;
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,stage)
select active,'10000000-0000-4000-8000-000000000001','batch','ARCHIVE-ACTIVE','in_production','kg',0,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',now()-interval '200 days','prep' from cache_fixture;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select ok(not((select closed from cache_fixture)=any(public.cache_lot_ids())),'Old closed batches remain outside the operational cache');
select ok((select active from cache_fixture)=any(public.cache_lot_ids()),'Old unfinished work remains available offline');
select ok(exists(select 1 from public.snapshot_bootstrap('lot') row where row->>'code'='ARCHIVE-ACTIVE'),'Bootstrap includes active historical batch');
select ok(not exists(select 1 from public.snapshot_bootstrap('lot') row where row->>'cooperative_id'='10000000-0000-4000-8000-000000000002'),'Bounded bootstrap keeps caller RLS');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.snapshot_bootstrap('lot')$$,'P0001','Snapshot permission required','Donor cannot download operational bootstrap');
select * from finish();rollback;
