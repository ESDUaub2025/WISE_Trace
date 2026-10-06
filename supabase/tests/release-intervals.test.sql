begin;
set local search_path=public,extensions;
select no_plan();
create temporary table interval_fixture(batch uuid,pack uuid,config uuid);
insert into interval_fixture values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on interval_fixture to authenticated;
insert into public.config_version(id,kind,version,effective_at,status,definition)
select config,'sop',900000002,now()-interval '2 days','approved',jsonb_set(definition,'{checkpoints}',jsonb_build_array(definition->'checkpoints'->1)) from interval_fixture cross join public.config_version where id='40000000-0000-4000-8000-000000000001';
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,stage)
select batch,'10000000-0000-4000-8000-000000000001','batch','INTERVAL-'||batch,'awaiting_review','kg',0,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',config,now()-interval '26 hours','preparation' from interval_fixture;
insert into public.stage_event(cooperative_id,lot_id,stage,observed_at,author_id)
select '10000000-0000-4000-8000-000000000001',batch,'drying',now()-interval '25 hours','20000000-0000-4000-8000-000000000001' from interval_fixture;
insert into public.stage_event(cooperative_id,lot_id,stage,observed_at,author_id)
select '10000000-0000-4000-8000-000000000001',batch,'grinding',now()-interval '1 hour','20000000-0000-4000-8000-000000000001' from interval_fixture;
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at)
select pack,'10000000-0000-4000-8000-000000000001','packaging','INTERVAL-PACK-'||pack,'awaiting_review','unit',2,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',config,now() from interval_fixture;
insert into public.packaging_detail(lot_id,cooperative_id,batch_id,packaging_material_id,package_type,size_kg,package_count,mass_kg,best_before,storage_location,label)
select pack,'10000000-0000-4000-8000-000000000001',batch,'60000000-0000-4000-8000-000000000004','kraft',0.5,2,1,current_date+30,'Dry store','{}' from interval_fixture;
insert into public.operational_record(id,cooperative_id,lot_id,kind,definition_key,config_version_id,payload,author_id,device_id,observed_at)
select gen_random_uuid(),'10000000-0000-4000-8000-000000000001',batch,'checkpoint','drying_temperature',config,jsonb_build_object('value',25,'unit',definition->'checkpoints'->0->>'unit'),'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now()-interval '24 hours' from interval_fixture join public.config_version on id=config;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.transition_lot((select batch from interval_fixture),'released','Review recurring history',public.pin_signoff('2468','30000000-0000-4000-8000-000000000001','decision',(select batch from interval_fixture)))$$,'P0001','Required recurring checkpoint interval missing','One drying reading cannot satisfy two required intervals');
reset role;
insert into public.operational_record(id,cooperative_id,lot_id,kind,definition_key,config_version_id,payload,author_id,device_id,observed_at)
select gen_random_uuid(),'10000000-0000-4000-8000-000000000001',batch,'checkpoint','drying_temperature',config,jsonb_build_object('value',25,'unit',definition->'checkpoints'->0->>'unit'),'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now()-interval '12 hours' from interval_fixture join public.config_version on id=config;
set local role authenticated;
select lives_ok($$select public.transition_lot((select batch from interval_fixture),'released','All recurring intervals reviewed',public.pin_signoff('2468','30000000-0000-4000-8000-000000000001','decision',(select batch from interval_fixture)))$$,'Two correctly timed readings satisfy both intervals');
select * from finish();
rollback;
