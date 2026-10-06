-- Fix ambiguous PL/pgSQL config-column reference found by live integration.
create or replace function public.apply_sync(envelope jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid := (envelope->>'id')::uuid; coop uuid := (envelope->>'cooperative_id')::uuid; dev uuid := (envelope->>'device_id')::uuid;
 observed timestamptz := (envelope->>'observed_at')::timestamptz; action_name text := envelope->>'action'; p jsonb := envelope->'payload';
 cfg uuid := (envelope->>'config_version_id')::uuid; rules jsonb; m public.membership; l public.lot; prior public.sync_receipt; err text; state_value text; code_value text; batch public.lot;
 q numeric; unit_value text; required_module record; item jsonb; definition jsonb;
begin
 select * into prior from public.sync_receipt where id=eid;
 if prior.id is not null then
 if prior.author_id<>auth.uid() or prior.device_id<>dev then raise exception 'Idempotency owner mismatch'; end if;
 return jsonb_build_object('id',eid,'status',prior.status,'error',prior.error); end if;
 select * into m from public.membership where user_id=auth.uid();
 if m.user_id is null or m.cooperative_id is distinct from coop or envelope->>'author_id' is distinct from auth.uid()::text then raise exception 'Author/cooperative mismatch'; end if;
 if not exists(select 1 from public.device where id=dev and cooperative_id=coop and revoked_at is null) then raise exception 'Device revoked or unregistered'; end if;
 perform pg_advisory_xact_lock(hashtextextended(eid::text,0));
 select * into prior from public.sync_receipt where id=eid;
 if prior.id is not null then return jsonb_build_object('id',eid,'status',prior.status,'error',prior.error); end if;
 perform set_config('wise.device_id',dev::text,true); perform set_config('wise.reason',coalesce(p->>'reason',''),true);
 begin
 if m.status<>'active' then raise exception 'Disabled account evidence retained for review'; end if;
 if not private.can_operate(coop,array['producer','supervisor','manager']) then raise exception 'Operational permission required'; end if;
 if observed>now()+interval '5 minutes' then raise exception 'Impossible future observation'; end if;
 select cv.definition into rules from public.config_version cv where cv.id=cfg and cv.status='approved' and cv.effective_at<=observed and (cv.cooperative_id is null or cv.cooperative_id=coop);
 if rules is null then raise exception 'Invalid effective configuration'; end if;

 if action_name in ('receipt','batch') then
 if not private.can_operate(coop,array['producer','supervisor']) then raise exception 'Producer permission required'; end if;
 if action_name='batch' then
 for required_module in select tm.* from public.training_module tm where tm.required and tm.config_version_id=cfg loop
 if not exists(select 1 from public.training_completion tc where tc.user_id=auth.uid() and tc.module_id=required_module.id and tc.completed_at<=observed and (tc.expires_at is null or tc.expires_at>observed)) and not exists(select 1 from public.training_exception te where te.user_id=auth.uid() and te.expires_at>observed) then raise exception 'Training required before batch creation'; end if;
 end loop;
 state_value:='draft';
 else
 if p->>'type' not in ('whey','ingredient','packaging_material') then raise exception 'Invalid receipt type'; end if;
 if p->>'type'='whey' and not(private.has_role(array['supervisor']) or coalesce((m.authorizations->>'receive_whey')::boolean,false)) then raise exception 'Receiving authorization required'; end if;
 if not exists(select 1 from public.supplier where id=(p->>'supplier_id')::uuid and cooperative_id=coop and status<>'suspended') then raise exception 'Supplier suspended or unavailable'; end if;
 state_value:='received'; end if;
 code_value := case when action_name='batch' then 'KB' when p->>'type'='whey' then 'WL' when p->>'type'='packaging_material' then 'PM' else 'IL' end || '-' || (select code from public.cooperative where id=coop) || '-' || to_char(observed at time zone 'Asia/Beirut','YYMMDD') || '-' || lpad(nextval('public.lot_code_sequence')::text,3,'0');
 insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,supplier_id,producer_id,device_id,config_version_id,observed_at,generation_at,expires_at,stage,facts)
 values(eid,coop,case when action_name='batch' then 'batch' else p->>'type' end,code_value,state_value,coalesce(p->>'unit','kg'),coalesce((p->>'quantity')::numeric,0),(p->>'supplier_id')::uuid,auth.uid(),dev,cfg,observed,(p->>'generation_at')::timestamptz,(p->>'expires_at')::timestamptz,case when action_name='batch' then rules->'stages'->0->>'key' else null end,coalesce(p->'facts','{}'));
 if action_name='receipt' then insert into public.inventory_movement values(gen_random_uuid(),coop,eid,'produced',(p->>'quantity')::numeric,p->>'unit','receipt',auth.uid(),dev,observed,now()); end if;
 elsif action_name='allocation' then
 insert into public.consumption values(eid,coop,(p->>'input_lot_id')::uuid,(p->>'output_lot_id')::uuid,(p->>'quantity')::numeric,p->>'unit',auth.uid(),dev,observed,now(),p->>'reason');
 elsif action_name in ('checkpoint','measurement','checklist','storage_inspection','note','sample','lab','stage','handover','calibration','complaint') then
 if not private.can_operate(coop,array['producer','supervisor']) then raise exception 'Recording permission required'; end if;
 select * into l from public.lot where id=(p->>'lot_id')::uuid and cooperative_id=coop;
 if l.id is null and action_name not in ('calibration') then raise exception 'Lot unavailable'; end if;
 if l.state in ('released','rejected','recalled','closed') then raise exception 'Locked record: amendment required'; end if;
 if l.id is not null and l.config_version_id<>cfg then raise exception 'Record configuration does not match lot'; end if;
 select c into definition from jsonb_array_elements(coalesce(rules->'checkpoints','[]')) c where c->>'key'=p->>'definition_key';
 if action_name='checkpoint' and definition is null then raise exception 'Unknown checkpoint'; end if;
 if action_name='checkpoint' and definition->>'stage' is distinct from l.stage then raise exception 'Checkpoint stage mismatch'; end if;
 if definition->>'min_plausible' is not null and (p->'values'->>'value')::numeric < (definition->>'min_plausible')::numeric then raise exception 'Value outside plausibility'; end if;
 if definition->>'max_plausible' is not null and (p->'values'->>'value')::numeric > (definition->>'max_plausible')::numeric then raise exception 'Value outside plausibility'; end if;
 insert into public.operational_record(id,cooperative_id,lot_id,kind,definition_key,config_version_id,payload,author_id,device_id,observed_at,due_at)
 values(eid,coop,l.id,action_name,p->>'definition_key',cfg,coalesce(p->'values',p),auth.uid(),dev,observed,(p->>'due_at')::timestamptz);
 if definition is not null and ((p->'values'->>'value')::numeric<(definition->>'min')::numeric or (p->'values'->>'value')::numeric>(definition->>'max')::numeric) then
 insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,detected_value,author_id,device_id,observed_at) values(gen_random_uuid(),coop,l.id,p->>'definition_key',coalesce(definition->>'severity','major'),'Out-of-range measurement',p->'values',auth.uid(),dev,observed);
 end if;
 update public.task set status='resolved' where lot_id=l.id and details->>'definition_key'=p->>'definition_key' and status='open';
 elsif action_name='deviation' then
 insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,corrective_action,preventive_action,owner_id,due_at,author_id,device_id,observed_at)
 values(eid,coop,(p->>'lot_id')::uuid,p->>'category',p->>'severity',p->>'issue',p->>'corrective_action',p->>'preventive_action',(p->>'owner_id')::uuid,(p->>'due_at')::timestamptz,auth.uid(),dev,observed);
 elsif action_name='training' then
 if not exists(select 1 from public.training_module where id=(p->>'module_id')::uuid and config_version_id=cfg) then raise exception 'Training module unavailable'; end if;
 insert into public.training_completion values(eid,coop,auth.uid(),(p->>'module_id')::uuid,observed,(p->>'score')::numeric,(p->>'expires_at')::timestamptz);
 elsif action_name='movement' then
 select * into l from public.lot where id=(p->>'lot_id')::uuid and cooperative_id=coop for update;
 if p->>'type' not in ('lost','disposed','sample','adjusted') then raise exception 'Unsupported manual movement'; end if;
 q:=(p->>'quantity')::numeric;
 if q=0 or (p->>'type'<>'adjusted' and q>=0) or length(coalesce(p->>'reason',''))<3 or p->>'unit'<>l.unit then raise exception 'Invalid movement'; end if;
 if public.lot_available(l.id)+q<0 then raise exception 'Movement exceeds stock'; end if;
 insert into public.inventory_movement values(eid,coop,l.id,p->>'type',q,p->>'unit',p->>'reason',auth.uid(),dev,observed,now());
 elsif action_name='sale' then
 select * into l from public.lot where id=(p->>'packaging_lot_id')::uuid and cooperative_id=coop for update;
 if l.state<>'released' or l.expires_at<=observed or l.expires_at<=now() then raise exception 'Only released unexpired stock can be sold'; end if;
 q:=(p->>'quantity')::numeric;
 if p->>'transaction_type'<>'return' and public.lot_available(l.id)<q then raise exception 'Sale exceeds stock'; end if;
 if p->>'currency'='USD' and (p->>'usd_rate')::numeric<>1 then raise exception 'USD rate must equal one'; end if;
 insert into public.sale values(eid,coop,l.id,p->>'transaction_type',q,p->>'customer_category',p->'customer_contact',(p->>'total')::numeric,p->>'currency',(p->>'usd_rate')::numeric,auth.uid(),dev,observed,now());
 insert into public.inventory_movement values(gen_random_uuid(),coop,l.id,case when p->>'transaction_type'='return' then 'returned' when p->>'transaction_type'='sale' then 'sold' else 'distributed' end,case when p->>'transaction_type'='return' then q else -q end,'unit','transaction',auth.uid(),dev,observed,now());
 elsif action_name='packaging' then
 select * into batch from public.lot where id=(p->>'batch_id')::uuid and cooperative_id=coop for update;
 if batch.type<>'batch' or batch.state not in ('draft','in_production','awaiting_review') then raise exception 'Batch unavailable for packaging'; end if;
 q:=(p->>'package_count')::numeric*(p->>'size_kg')::numeric;
 code_value:='PL-'||(select code from public.cooperative where id=coop)||'-'||to_char(observed,'YYMMDD')||'-'||lpad(nextval('public.lot_code_sequence')::text,3,'0');
 if (p->>'best_before')::date>(observed::date+make_interval(days=>(rules->>'shelf_life_days')::integer))::date then raise exception 'Cannot extend best-before'; end if;
 insert into public.lot(id,cooperative_id,type,code,state,unit,initial_quantity,producer_id,device_id,config_version_id,observed_at,expires_at,facts) values(eid,coop,'packaging',code_value,'awaiting_review','unit',(p->>'package_count')::numeric,auth.uid(),dev,cfg,observed,((p->>'best_before')::date+1)::timestamptz,p);
 -- Batch output mass is recorded once per packaging session before consuming into packaging.
 insert into public.inventory_movement values(gen_random_uuid(),coop,batch.id,'produced',q,'kg','packaged production',auth.uid(),dev,observed,now());
 insert into public.consumption values(gen_random_uuid(),coop,batch.id,eid,q,'kg',auth.uid(),dev,observed,now(),'packaging');
 insert into public.consumption values(gen_random_uuid(),coop,(p->>'packaging_material_id')::uuid,eid,(p->>'package_count')::numeric,'unit',auth.uid(),dev,observed,now(),'packaging material');
 insert into public.packaging_detail(lot_id,cooperative_id,batch_id,packaging_material_id,package_type,size_kg,package_count,mass_kg,best_before,storage_location,label) values(eid,coop,batch.id,(p->>'packaging_material_id')::uuid,p->>'package_type',(p->>'size_kg')::numeric,(p->>'package_count')::integer,q,(p->>'best_before')::date,p->>'storage_location',coalesce(p->'label','{}'));
 insert into public.inventory_movement values(gen_random_uuid(),coop,eid,'produced',(p->>'package_count')::numeric,'unit','packaging',auth.uid(),dev,observed,now());
 update public.lot set state='awaiting_review' where id=batch.id;
 else raise exception 'Unknown sync action'; end if;
 insert into public.sync_receipt values(eid,coop,auth.uid(),dev,action_name,envelope,'synced',null,observed,now());
 exception when others then
 get stacked diagnostics err=MESSAGE_TEXT;
 insert into public.sync_receipt values(eid,coop,auth.uid(),dev,action_name,envelope,'conflict',err,observed,now());
 insert into public.task(cooperative_id,kind,due_at,details,source_key) values(coop,'sync_conflict',now(),jsonb_build_object('receipt_id',eid,'error',err,'original',envelope),'conflict:'||eid);
 end;
 update public.device set last_sync_at=now() where id=dev;
 return jsonb_build_object('id',eid,'status',case when err is null then 'synced' else 'conflict' end,'error',err,'code',code_value);
end $$;
