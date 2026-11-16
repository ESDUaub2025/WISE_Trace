begin;
set local search_path=public,extensions;
select no_plan();
create temporary table mvp_fixture(config uuid,record uuid,sign uuid);
insert into mvp_fixture values(gen_random_uuid(),gen_random_uuid(),null);
grant select,update on mvp_fixture to authenticated;
insert into public.config_version(id,cooperative_id,kind,version,effective_at,status,definition,placeholder)
select f.config,'10000000-0000-4000-8000-000000000001','sop',199,now()-interval '1 day','approved',c.definition,false from mvp_fixture f cross join public.config_version c where c.id='40000000-0000-4000-8000-000000000001';
insert into public.operational_record(id,cooperative_id,lot_id,kind,config_version_id,payload,author_id,device_id,observed_at)
select f.record,'10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000010','measurement','40000000-0000-4000-8000-000000000001','{"value":25}','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now() from mvp_fixture f;
insert into public.attachment(id,cooperative_id,record_id,storage_path,media_type,author_id)
select gen_random_uuid(),'10000000-0000-4000-8000-000000000001',record,'test/crosscheck.jpg','image/jpeg','20000000-0000-4000-8000-000000000001' from mvp_fixture;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.record_ocr_crosscheck((select record from mvp_fixture),'{"value":26,"confidence":0.9}','30000000-0000-4000-8000-000000000001')$$,'Photo cross-check appends a review note');
select is((select payload->>'value' from public.operational_record where id=(select record from mvp_fixture)),'25','Cross-check preserves the original manual reading');
select throws_ok($$select public.record_ocr_crosscheck((select record from mvp_fixture),'{"value":26,"confidence":2}','30000000-0000-4000-8000-000000000001')$$,'P0001','Invalid OCR suggestion','Invalid confidence cannot be stored');
select throws_ok($$select public.migrate_batch_sop('60000000-0000-4000-8000-000000000010',(select config from mvp_fixture),'Approved revision',gen_random_uuid())$$,'P0001','Admin, active unpackaged batch and migration reason required','Producer cannot migrate an active batch');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select public.register_device('30000000-0000-4000-8000-000000000099','Migration test');
update mvp_fixture set sign=public.pin_signoff('2468','30000000-0000-4000-8000-000000000099','migrate_sop','60000000-0000-4000-8000-000000000010');
select lives_ok($$select public.migrate_batch_sop('60000000-0000-4000-8000-000000000010',(select config from mvp_fixture),'Approved compatible revision',(select sign from mvp_fixture))$$,'Admin migrates compatible active batch with a fresh PIN');
select is((select config_version_id from public.lot where id='60000000-0000-4000-8000-000000000010'),(select config from mvp_fixture),'Batch pins the explicitly approved new SOP');
select is((select config_version_id from public.operational_record where id=(select record from mvp_fixture)),'40000000-0000-4000-8000-000000000001'::uuid,'Earlier evidence keeps its original SOP version');
select ok(exists(select 1 from public.amendment where object_id='60000000-0000-4000-8000-000000000010' and changes ? 'previous_config_version_id'),'Migration retains an append-only reason and original SOP');
select * from finish();rollback;
