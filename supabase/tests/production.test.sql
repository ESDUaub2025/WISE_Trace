begin;
set local search_path=public,extensions;
select no_plan();
create temporary table production_fixture(id uuid,record_id uuid);
insert into production_fixture values(gen_random_uuid(),gen_random_uuid());
grant select on production_fixture to authenticated;
insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,stage)
select id,'10000000-0000-4000-8000-000000000001','batch','TEST-PRODUCTION-'||id,'in_production','kg',0,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',now()-interval '2 hours','preparation' from production_fixture;
create function pg_temp.production_envelope(action text,payload jsonb,record_id uuid default gen_random_uuid()) returns jsonb language sql as $$
 select jsonb_build_object('id',record_id,'cooperative_id','10000000-0000-4000-8000-000000000001','author_id','20000000-0000-4000-8000-000000000001','device_id','30000000-0000-4000-8000-000000000001','config_version_id','40000000-0000-4000-8000-000000000001','action',action,'observed_at',now(),'payload',payload)
$$;
grant execute on function pg_temp.production_envelope(text,jsonb,uuid) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select is(public.apply_sync(pg_temp.production_envelope('checkpoint',jsonb_build_object('lot_id',(select id from production_fixture),'definition_key','hygiene','due_at',now()+interval '1 day','values','{"all_ok":true}'::jsonb),(select record_id from production_fixture)))->>'status','synced','Checkpoint stores an observation against its original SOP');
select ok((select late from public.operational_record where id=(select record_id from production_fixture)),'Server flags overdue observation despite a caller-supplied future due date');
select is((select due_at from public.operational_record where id=(select record_id from production_fixture)),now()-interval '2 hours','First checkpoint due time uses stage entry');
select is(public.apply_sync(pg_temp.production_envelope('handover',jsonb_build_object('lot_id',(select id from production_fixture),'next_producer','20000000-0000-4000-8000-000000000008','reason','Cross-cooperative handover attempt')))->>'status','conflict','Responsibility cannot pass to another cooperative producer');
select is(public.apply_sync(pg_temp.production_envelope('handover',jsonb_build_object('lot_id',(select id from production_fixture),'next_producer','20000000-0000-4000-8000-000000000001','reason','Confirmed production responsibility')))->>'status','synced','Provisional handover is validated and applied');
select is((select count(*)::integer from public.operational_record where lot_id=(select id from production_fixture) and kind='handover'),1,'Handover writes exactly one attributed record');
select is((select producer_id from public.lot where id=(select id from production_fixture)),'20000000-0000-4000-8000-000000000001'::uuid,'Handover preserves original batch author');
select is(public.apply_sync(pg_temp.production_envelope('allocation',jsonb_build_object('input_lot_id','60000000-0000-4000-8000-000000000001','output_lot_id',(select id from production_fixture),'quantity',1,'unit','kg')))->>'status','synced','Input allocated before abandonment');
select is(public.apply_sync(pg_temp.production_envelope('abandon',jsonb_build_object('lot_id',(select id from production_fixture),'reason','Fermentation could not proceed')))->>'status','synced','Unpackaged batch can be abandoned with a reason');
select is((select state from public.lot where id=(select id from production_fixture)),'rejected','Abandoned batch remains rejected');
select is((select sum(quantity) from public.consumption where output_lot_id=(select id from production_fixture)),1::numeric,'Abandonment keeps consumed input in losses');
select is(public.apply_sync(pg_temp.production_envelope('calibration',jsonb_build_object('values',jsonb_build_object('equipment_id',(select id from public.equipment limit 1),'method','reference_weight','reference_value',1,'measured_value',1,'unit','kg','result','pass'))))->>'status','synced','Equipment verification records the reference and measured value');
select is(public.apply_sync(pg_temp.production_envelope('calibration',jsonb_build_object('values',jsonb_build_object('equipment_id',(select id from public.equipment limit 1),'method','reference_weight','reference_value',1,'measured_value',2,'unit','kg','result','fail'))))->>'status','synced','Failed verification is retained as evidence');
select ok(exists(select 1 from public.task where details->>'verification_id' is not null),'Failed verification creates a review task');
select is(public.apply_sync(pg_temp.production_envelope('calibration','{"values":{}}'::jsonb))->>'status','conflict','Empty equipment checks cannot be saved as verification');
select * from finish();
rollback;
