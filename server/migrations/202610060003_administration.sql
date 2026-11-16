create function public.register_device(target uuid,label text) returns void language plpgsql security definer set search_path='' as $$ declare m public.membership; begin
 select * into m from public.membership where user_id=wise_auth.uid() and status='active';
 if m.cooperative_id is null or not private.has_role(array['producer','supervisor','manager','admin','food_safety']) then raise exception 'Device registration denied'; end if;
 if exists(select 1 from public.device where id=target and (cooperative_id<>m.cooperative_id or revoked_at is not null)) then raise exception 'Device revoked or belongs to another cooperative'; end if;
 insert into public.device(id,cooperative_id,label,registered_by) values(target,m.cooperative_id,label,m.user_id) on conflict(id) do nothing;
end $$;
create function public.advance_stage(target uuid,next_stage text) returns void language plpgsql security definer set search_path='' as $$
declare l public.lot; rules jsonb; current_index integer; next_index integer; c jsonb;
begin
 select * into l from public.lot where id=target for update;
 if not private.can_operate(l.cooperative_id,array['producer','supervisor']) then raise exception 'Producer permission required'; end if;
 if l.type<>'batch' or l.state not in ('draft','in_production') then raise exception 'Invalid stage transition'; end if;
 select definition into rules from public.config_version where id=l.config_version_id;
 select ordinality into current_index from jsonb_array_elements(rules->'stages') with ordinality where value->>'key'=l.stage;
 select ordinality into next_index from jsonb_array_elements(rules->'stages') with ordinality where value->>'key'=next_stage;
 if next_index is null or current_index is null or next_index<>current_index+1 then raise exception 'Stages must advance in order'; end if;
 for c in select value from jsonb_array_elements(rules->'checkpoints') where value->>'stage'=l.stage and (value->>'required')::boolean loop
 if not exists(select 1 from public.operational_record where lot_id=target and definition_key=c->>'key') then raise exception 'Stage checkpoint missing'; end if;
 end loop;
 update public.lot set state='in_production',stage=next_stage where id=target;
end $$;
create function public.draft_configuration(kind text,definition jsonb,effective timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; begin
 if not private.has_role(array['admin']) then raise exception 'Admin AAL2 required'; end if;
 if kind='sop' and (jsonb_typeof(definition->'stages')<>'array' or jsonb_typeof(definition->'checkpoints')<>'array') then raise exception 'SOP stages/checkpoints required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('configuration:'||kind,0));
 insert into public.config_version(kind,version,effective_at,definition,drafted_by,placeholder) values(kind,coalesce((select max(version)+1 from public.config_version where config_version.kind=draft_configuration.kind and cooperative_id is null),1),effective,definition,wise_auth.uid(),true) returning id into target;
 return target;
end $$;
create function public.approve_configuration(target uuid,sign uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(array['food_safety']) then raise exception 'Food-Safety Lead AAL2 required'; end if;
 perform private.consume_signoff(sign,'config',target);
 update public.config_version set status='approved',approved_by=wise_auth.uid(),approved_at=now(),placeholder=false where id=target and status='draft' and drafted_by<>wise_auth.uid();
 if not found then raise exception 'Separate approver and draft required'; end if;
end $$;
create function public.register_attachment(target uuid,record uuid,path text,media_type text) returns void language plpgsql security definer set search_path='' as $$
declare receipt public.sync_receipt;
begin
 select * into receipt from public.sync_receipt where id=record and author_id=wise_auth.uid() and status='synced';
 if receipt.id is null or not private.can_read(receipt.cooperative_id) or split_part(path,'/',1)<>receipt.cooperative_id::text then raise exception 'Attachment scope invalid'; end if;
 insert into public.attachment(id,cooperative_id,record_id,author_id,storage_path,media_type) values(target,receipt.cooperative_id,record,wise_auth.uid(),path,media_type);
end $$;
create function public.revoke_device(target uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare d public.device; begin
 select * into d from public.device where id=target;
 if not private.can_operate(d.cooperative_id,array['admin','manager']) or length(reason)<3 then raise exception 'Device revocation denied'; end if;
 perform set_config('wise.reason',reason,true);update public.device set revoked_at=now() where id=target;
end $$;
create function public.manage_registry(entity text,target uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare coop uuid:=(payload->>'cooperative_id')::uuid;
begin
 if not private.can_operate(coop,array['admin']) then raise exception 'Admin permission required'; end if;
 if entity='supplier' then insert into public.supplier values(target,coop,payload->>'name',payload->>'type',coalesce(payload->>'status','provisional'),coalesce(payload->'contacts','{}'),coalesce(payload->'declarations','{}')) on conflict(id) do update set name=excluded.name,type=excluded.type,status=excluded.status,contacts=excluded.contacts,declarations=excluded.declarations;
 elsif entity='equipment' then insert into public.equipment values(target,coop,payload->>'label',payload->>'type',(payload->>'calibrated_at')::timestamptz,(payload->>'next_due_at')::timestamptz,coalesce(payload->>'status','active')) on conflict(id) do update set calibrated_at=excluded.calibrated_at,next_due_at=excluded.next_due_at,status=excluded.status;
 else raise exception 'Registry not supported'; end if;
end $$;
create function public.complete_recall(target uuid,actions jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.recall; item jsonb;
begin
 select * into r from public.recall where id=target for update;
 if not private.can_operate(r.cooperative_id,array['supervisor','manager','admin','food_safety']) then raise exception 'Recall permission required'; end if;
 for item in select value from jsonb_array_elements(actions) loop
 insert into public.recall_action values(gen_random_uuid(),target,r.cooperative_id,item->>'action',coalesce((item->>'quantity')::numeric,0),item->>'notes',wise_auth.uid(),now()); end loop;
 update public.recall set status='closed',completed_at=now() where id=target;
end $$;
create function public.generate_tasks() returns integer language plpgsql security definer set search_path='' as $$
declare l record; c jsonb; latest timestamptz; due timestamptz; result integer:=0;
begin
 for l in select lot.*,cv.definition from public.lot join public.config_version cv on cv.id=lot.config_version_id where lot.state in ('in_production','draft') loop
 for c in select value from jsonb_array_elements(l.definition->'checkpoints') where value->>'stage'=l.stage loop
 select max(observed_at) into latest from public.operational_record where lot_id=l.id and definition_key=c->>'key';
 due:=coalesce(latest,l.observed_at)+make_interval(hours=>coalesce((c->>'interval_hours')::integer,0));
 if latest is null or c->>'interval_hours' is not null then
 insert into public.task(cooperative_id,lot_id,kind,due_at,details,source_key) values(l.cooperative_id,l.id,'checkpoint_due',due,jsonb_build_object('definition_key',c->>'key'),'check:'||l.id||':'||(c->>'key')||':'||due) on conflict(source_key) do nothing;
 end if; end loop; end loop;
 insert into public.task(cooperative_id,lot_id,kind,due_at,source_key) select cooperative_id,id,'expiry',expires_at-interval '6 hours','expiry:'||id from public.lot where expires_at<now()+interval '1 day' and state not in ('rejected','recalled','closed') on conflict(source_key) do nothing;
 insert into public.task(cooperative_id,kind,due_at,details,source_key) select cooperative_id,'calibration',next_due_at,jsonb_build_object('equipment_id',id,'label',label),'calibration:'||id||':'||next_due_at from public.equipment where next_due_at<now()+interval '7 days' on conflict(source_key) do nothing;
 select count(*) into result from public.task where status='open';return result;
end $$;
revoke all on function public.generate_tasks() from public,anon,authenticated;
grant execute on function public.generate_tasks() to service_role;
grant execute on function public.register_device(uuid,text),public.advance_stage(uuid,text),public.draft_configuration(text,jsonb,timestamptz),public.approve_configuration(uuid,uuid),public.register_attachment(uuid,uuid,text,text),public.revoke_device(uuid,text),public.manage_registry(text,uuid,jsonb),public.complete_recall(uuid,jsonb) to authenticated;

insert into wise_storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('evidence','evidence',false,1048576,array['image/jpeg','audio/webm','audio/mp4','audio/ogg']) on conflict(id) do nothing;
create policy evidence_read on wise_storage.objects for select to authenticated using(bucket_id='evidence' and private.can_read((wise_storage.foldername(name))[1]::uuid));
create policy evidence_insert on wise_storage.objects for insert to authenticated with check(bucket_id='evidence' and private.can_operate((wise_storage.foldername(name))[1]::uuid,array['producer','supervisor','manager']));

-- Scheduled by the application worker; no database scheduler extension required.
