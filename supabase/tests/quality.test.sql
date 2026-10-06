begin;
set local search_path=public,extensions;
select no_plan();
create temporary table quality_fixture(batch uuid,pack uuid,config uuid,lab uuid);
insert into quality_fixture values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on quality_fixture to authenticated;
insert into public.config_version(id,kind,version,effective_at,status,definition)
select config,'sop',900000001,now()-interval '1 day','approved',jsonb_set(jsonb_set(definition,'{checkpoints}','[]'),'{lab_before_release}','true') from quality_fixture cross join public.config_version where id='40000000-0000-4000-8000-000000000001';
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,stage)
select batch,'10000000-0000-4000-8000-000000000001','batch','QUALITY-'||batch,'awaiting_review','kg',0,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',config,now(),'packing' from quality_fixture;
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at)
select pack,'10000000-0000-4000-8000-000000000001','packaging','QUALITY-PACK-'||pack,'awaiting_review','unit',2,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',config,now() from quality_fixture;
insert into public.packaging_detail(lot_id,cooperative_id,batch_id,packaging_material_id,package_type,size_kg,package_count,mass_kg,best_before,storage_location,label)
select pack,'10000000-0000-4000-8000-000000000001',batch,'60000000-0000-4000-8000-000000000004','kraft',0.5,2,1,current_date+30,'Dry store','{}' from quality_fixture;
create function pg_temp.quality_sync(action text,readings jsonb,target uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.apply_sync(jsonb_build_object('id',target,'cooperative_id','10000000-0000-4000-8000-000000000001','author_id','20000000-0000-4000-8000-000000000001','device_id','30000000-0000-4000-8000-000000000001','config_version_id',(select config from quality_fixture),'observed_at',now(),'action',action,'payload',jsonb_build_object('lot_id',(select batch from quality_fixture),'values',readings)));
$$;
grant execute on function pg_temp.quality_sync(text,jsonb,uuid) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select is(pg_temp.quality_sync('sample','{}')->>'status','conflict','Missing sample identity is retained as a conflict');
select is(pg_temp.quality_sync('sample',jsonb_build_object('sample_id','S-1','sampled_at',now()+interval '1 day'))->>'status','conflict','Impossible future sampling time is rejected');
select is(pg_temp.quality_sync('sample',jsonb_build_object('sample_id','S-1','sampled_at',now()))->>'status','synced','Sample can be recorded before laboratory results exist');
select is(pg_temp.quality_sync('lab',jsonb_build_object('sample_id','S-1','sampled_at',now(),'result','pass'))->>'status','conflict','Unattributed passing lab result is rejected');
select is(pg_temp.quality_sync('lab',jsonb_build_object('sample_id','S-1','sampled_at',now(),'result','pass','lab','Test laboratory','reference','REPORT-1'),(select lab from quality_fixture))->>'status','synced','Lab report is linked later by sample ID, laboratory and reference');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.transition_lot((select batch from quality_fixture),'released','Review complete',public.pin_signoff('2468','30000000-0000-4000-8000-000000000001','decision',(select batch from quality_fixture)))$$,'P0001','Required laboratory report has not synchronized','Lab-required SOP cannot release a typed result without report evidence');
reset role;
insert into public.attachment(id,cooperative_id,record_id,author_id,storage_path,media_type)
select gen_random_uuid(),'10000000-0000-4000-8000-000000000001',lab,'20000000-0000-4000-8000-000000000001','quality-test/report.jpg','image/jpeg' from quality_fixture;
set local role authenticated;
select lives_ok($$select public.transition_lot((select batch from quality_fixture),'released','Review and synchronized laboratory evidence complete',public.pin_signoff('2468','30000000-0000-4000-8000-000000000001','decision',(select batch from quality_fixture)))$$,'Passing synchronized laboratory evidence satisfies the original SOP gate');
select * from finish();
rollback;
