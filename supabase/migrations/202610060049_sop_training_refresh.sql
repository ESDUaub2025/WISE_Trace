create function private.sop_training_refresh() returns trigger language plpgsql security definer set search_path='' as $$
declare previous uuid;module public.training_module;revision integer;target uuid;member public.membership;
begin
 select cv.id into previous from public.config_version cv where cv.id<>new.id and cv.kind='sop' and cv.status='approved' and cv.effective_at<=new.effective_at and (cv.cooperative_id is null or cv.cooperative_id=new.cooperative_id) order by (cv.cooperative_id is not null) desc,cv.version desc limit 1;
 for module in select tm.* from public.training_module tm where tm.config_version_id=previous and tm.required and tm.effective_at<=new.effective_at and not exists(select 1 from public.training_module newer where newer.config_version_id=tm.config_version_id and newer.module_key=tm.module_key and newer.version>tm.version and newer.effective_at<=new.effective_at) loop
  perform pg_advisory_xact_lock(hashtextextended('training:'||module.module_key,0));
  select coalesce(max(tm.version),0)+1 into revision from public.training_module tm where tm.module_key=module.module_key;
  target:=gen_random_uuid();
  insert into public.training_module(id,config_version_id,module_key,version,required,content,assessment,effective_at) values(target,new.id,module.module_key,revision,true,module.content||jsonb_build_object('source_module_id',module.id),module.assessment,new.effective_at);
  for member in select * from public.membership where status='active' and 'producer'=any(roles) and (new.cooperative_id is null or cooperative_id=new.cooperative_id) loop
   insert into public.task(cooperative_id,user_id,kind,due_at,details,source_key) values(member.cooperative_id,member.user_id,'training',new.effective_at+interval '14 days',jsonb_build_object('module_id',target,'version',revision,'effective_at',new.effective_at,'config_version_id',new.id),'training:'||target||':'||member.user_id);
   insert into public.notification(cooperative_id,user_id,kind,payload) values(member.cooperative_id,member.user_id,'training',jsonb_build_object('module_id',target,'effective_at',new.effective_at,'config_version_id',new.id));
  end loop;
 end loop;
 return new;
end $$;
revoke all on function private.sop_training_refresh() from public,anon,authenticated;
create trigger sop_training_refresh after update of status on public.config_version for each row when(old.status='draft' and new.status='approved' and new.kind='sop') execute function private.sop_training_refresh();

create function private.require_introductory_training() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.type='batch' and auth.uid() is not null and not exists(select 1 from public.training_module where config_version_id=new.config_version_id and required and effective_at<=new.observed_at) then raise exception 'Required introductory training is not configured';end if;
 return new;
end $$;
revoke all on function private.require_introductory_training() from public,anon,authenticated;
create trigger require_introductory_training before insert on public.lot for each row execute function private.require_introductory_training();
