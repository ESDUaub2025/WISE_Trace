create or replace function public.generate_tasks() returns integer language plpgsql security definer set search_path='' as $$
declare l record; c jsonb; latest timestamptz; started timestamptz; due timestamptz; result integer:=0;
begin
 for l in select lot.*,cv.definition from public.lot join public.config_version cv on cv.id=lot.config_version_id where lot.state in ('in_production','draft') loop
 select coalesce(max(observed_at),l.observed_at) into started from public.stage_event where lot_id=l.id and stage=l.stage;
 for c in select value from jsonb_array_elements(l.definition->'checkpoints') where value->>'stage'=l.stage and coalesce((value->>'required')::boolean,false) loop
 select max(observed_at) into latest from public.operational_record where lot_id=l.id and definition_key=c->>'key' and observed_at>=started;
 due:=coalesce(latest,started)+make_interval(secs=>case when latest is null then coalesce((c->>'offset_hours')::numeric,0) else coalesce((c->>'interval_hours')::numeric,0) end*3600);
 if latest is null or c->>'interval_hours' is not null then insert into public.task(cooperative_id,lot_id,kind,due_at,details,source_key) values(l.cooperative_id,l.id,'checkpoint_due',due,jsonb_build_object('definition_key',c->>'key'),'check:'||l.id||':'||(c->>'key')||':'||due) on conflict(source_key) do nothing; end if;
 end loop;
 for c in select value from jsonb_array_elements(l.definition->'stages') where value->>'key'=l.stage and value->>'expected_hours' is not null loop
 due:=started+make_interval(hours=>(c->>'expected_hours')::integer);
 if due<now() then insert into public.task(cooperative_id,lot_id,kind,due_at,source_key) values(l.cooperative_id,l.id,'stage_overdue',due,'stage:'||l.id||':'||l.stage) on conflict(source_key) do nothing; end if;end loop;
 end loop;
 insert into public.task(cooperative_id,lot_id,kind,due_at,source_key) select cooperative_id,id,'expiry',expires_at-interval '6 hours','expiry:'||id from public.lot where expires_at<now()+interval '1 day' and state not in ('rejected','recalled','closed') and public.lot_available(id)>0 on conflict(source_key) do nothing;
 insert into public.task(cooperative_id,lot_id,kind,due_at,source_key) select cooperative_id,id,case when state='awaiting_review' then 'review_task' else 'awaiting_decision' end,recorded_at,'decision:'||id||':'||state from public.lot where state in ('hold','on_hold','received','awaiting_review') on conflict(source_key) do nothing;
 insert into public.task(cooperative_id,kind,due_at,details,source_key) select cooperative_id,'calibration',next_due_at,jsonb_build_object('equipment_id',id,'label',label),'calibration:'||id||':'||next_due_at from public.equipment where next_due_at<now()+interval '7 days' on conflict(source_key) do nothing;
 insert into public.task(cooperative_id,user_id,kind,due_at,details,source_key) select member.cooperative_id,member.user_id,'training_due',now(),jsonb_build_object('module_id',module.id),'training:'||member.user_id||':'||module.id from public.membership member cross join public.training_module module join public.config_version cv on cv.id=module.config_version_id where 'producer'=any(member.roles) and member.status='active' and module.required and cv.status='approved' and cv.effective_at<=now() and (cv.cooperative_id is null or cv.cooperative_id=member.cooperative_id) and not exists(select 1 from public.training_completion tc where tc.user_id=member.user_id and tc.module_id=module.id and (tc.expires_at is null or tc.expires_at>now())) on conflict(source_key) do nothing;
 insert into public.task(cooperative_id,lot_id,user_id,kind,due_at,details,source_key) select cooperative_id,lot_id,owner_id,'deviation_action_due',due_at,jsonb_build_object('deviation_id',id),'capa:'||id from public.deviation where closed_at is null and due_at is not null on conflict(source_key) do nothing;
 insert into public.task(cooperative_id,kind,due_at,details,source_key) select cooperative_id,'sync_stale',coalesce(last_sync_at,now()-interval '1 day'),jsonb_build_object('device_id',id),'sync:'||id||':'||current_date from public.device where revoked_at is null and coalesce(last_sync_at,now()-interval '2 days')<now()-interval '24 hours' on conflict(source_key) do nothing;
 select count(*) into result from public.task where status='open';return result;
end $$;
revoke execute on function public.generate_tasks() from public,anon,authenticated;
grant execute on function public.generate_tasks() to service_role;
