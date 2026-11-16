create function public.migrate_batch_sop(target uuid,configuration uuid,reason text,sign uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.lot;c public.config_version;device uuid;begin
 select * into l from public.lot where id=target for update;
 if not private.can_operate(l.cooperative_id,array['admin']) or l.type<>'batch' or l.state not in ('draft','in_production','on_hold') or exists(select 1 from public.packaging_detail where batch_id=target) or length(trim(reason))<3 then raise exception 'Admin, active unpackaged batch and migration reason required';end if;
 select * into c from public.config_version where id=configuration and kind='sop' and status='approved' and effective_at<=now() and (cooperative_id is null or cooperative_id=l.cooperative_id);
 if c.id is null or c.id=l.config_version_id or not exists(select 1 from jsonb_array_elements(c.definition->'stages') stage where stage->>'key'=l.stage) then raise exception 'Approved compatible SOP required';end if;
 if exists(select 1 from public.training_module tm where tm.config_version_id=c.id and tm.required and tm.effective_at<=now() and not exists(select 1 from public.training_module newer where newer.config_version_id=c.id and newer.module_key=tm.module_key and newer.version>tm.version and newer.effective_at<=now()) and not exists(select 1 from public.training_completion tc where tc.user_id=l.producer_id and tc.module_id=tm.id and (tc.expires_at is null or tc.expires_at>now()))) and not exists(select 1 from public.training_exception where user_id=l.producer_id and expires_at>now()) then raise exception 'Producer must complete the new SOP training before migration';end if;
 select device_id into device from public.signoff where id=sign;
 perform private.consume_signoff(sign,'migrate_sop',target);
 perform set_config('wise.reason',reason,true);perform set_config('wise.device_id',device::text,true);
 insert into public.amendment(id,cooperative_id,object_id,object_type,changes,reason,author_id,device_id,observed_at) values(gen_random_uuid(),l.cooperative_id,l.id,'lot',jsonb_build_object('previous_config_version_id',l.config_version_id,'config_version_id',configuration),reason,wise_auth.uid(),device,now());
 update public.lot set config_version_id=configuration where id=target;
end $$;
revoke all on function public.migrate_batch_sop(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.migrate_batch_sop(uuid,uuid,text,uuid) to authenticated;
create function public.batch_training_validity(target uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare l public.lot;required integer;completed integer;exception boolean;begin
 select * into l from public.lot where id=target and type='batch';if l.id is null then raise exception 'Batch unavailable';end if;
 select count(*),count(*) filter(where exists(select 1 from public.training_completion tc where tc.user_id=l.producer_id and tc.module_id=tm.id and tc.completed_at<=l.observed_at and (tc.expires_at is null or tc.expires_at>l.observed_at))) into required,completed from public.training_module tm where tm.config_version_id=l.config_version_id and tm.required and tm.effective_at<=l.observed_at and not exists(select 1 from public.training_module newer where newer.config_version_id=tm.config_version_id and newer.module_key=tm.module_key and newer.version>tm.version and newer.effective_at<=l.observed_at);
 select exists(select 1 from public.training_exception where user_id=l.producer_id and expires_at>l.observed_at) into exception;
 return jsonb_build_object('required',required,'completed',completed,'exception',exception,'valid',required>0 and required=completed or exception);
end $$;
revoke all on function public.batch_training_validity(uuid) from public,anon;
grant execute on function public.batch_training_validity(uuid) to authenticated;
