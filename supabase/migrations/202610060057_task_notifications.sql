create unique index notification_task_once on public.notification((payload->>'task_id')) where payload ? 'task_id';
create function private.notify_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.status='open' and NEW.due_at<=now() and (TG_OP='INSERT' or OLD.status<>'open') then
  insert into public.notification(cooperative_id,user_id,kind,payload)
  values(NEW.cooperative_id,NEW.user_id,case when NEW.kind='review_task' then 'review' when NEW.kind='held_whey_expiry' then 'held_whey_expiry' else 'task' end,jsonb_build_object('task_id',NEW.id,'lot_id',NEW.lot_id,'task_kind',NEW.kind)) on conflict do nothing;
 end if;
 return NEW;
end $$;
revoke all on function private.notify_task() from public,anon,authenticated;
create trigger notify_task after insert or update of status on public.task for each row execute function private.notify_task();

alter function public.generate_tasks() rename to generate_tasks_v50;
revoke all on function public.generate_tasks_v50() from public,anon,authenticated,service_role;
create function public.generate_tasks() returns integer language plpgsql security definer set search_path='' as $$
declare result integer;
begin
 perform public.generate_tasks_v50();
 insert into public.task(cooperative_id,lot_id,kind,due_at,details,source_key)
 select l.cooperative_id,l.id,'held_whey_expiry',l.generation_at+make_interval(secs=>(cv.definition->>'whey_max_age_hours')::numeric*3600)-interval '6 hours',jsonb_build_object('lot_code',l.code),'held-expiry:'||l.id
 from public.lot l join public.config_version cv on cv.id=l.config_version_id
 where l.type='whey' and l.state in ('hold','on_hold') and l.generation_at is not null and public.lot_available(l.id)>0
 and l.generation_at+make_interval(secs=>(cv.definition->>'whey_max_age_hours')::numeric*3600)<now()+interval '6 hours'
 on conflict(source_key) do nothing;
 update public.task t set status='resolved' from public.lot l where t.lot_id=l.id and t.kind='held_whey_expiry' and t.status='open' and (l.state not in ('hold','on_hold') or public.lot_available(l.id)<=0);
 insert into public.notification(cooperative_id,user_id,kind,payload)
 select t.cooperative_id,t.user_id,case when t.kind='review_task' then 'review' when t.kind='held_whey_expiry' then 'held_whey_expiry' else 'task' end,jsonb_build_object('task_id',t.id,'lot_id',t.lot_id,'task_kind',t.kind)
 from public.task t where t.status='open' and t.due_at<=now() on conflict do nothing;
 select count(*) into result from public.task where status='open';return result;
end $$;
revoke all on function public.generate_tasks() from public,anon,authenticated;
grant execute on function public.generate_tasks() to service_role;
