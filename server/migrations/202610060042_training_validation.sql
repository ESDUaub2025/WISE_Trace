create or replace function public.publish_training(module_key text,content jsonb,assessment jsonb,required boolean,config uuid,effective timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=gen_random_uuid(); revision integer; question jsonb; member public.membership; rules public.config_version;resource jsonb;
begin
 if not private.has_role(array['admin']) then raise exception 'Admin AAL2 required'; end if;
 if length(coalesce(module_key,''))<2 or length(coalesce(content->>'en',''))<20 or length(coalesce(content->>'ar',''))<20 or coalesce(jsonb_typeof(assessment),'')<>'array' or jsonb_array_length(assessment)=0 or effective<now() then raise exception 'Bilingual versioned content, assessment and future effective date required'; end if;
  select * into rules from public.config_version where id=config and status='approved';
 if rules.id is null or effective<rules.effective_at then raise exception 'Approved effective configuration required';end if;
 if content->>'refresh_days' is not null and ((content->>'refresh_days')::integer not between 1 and 3650) then raise exception 'Invalid refresher interval';end if;
 for resource in select value from jsonb_array_elements(coalesce(content->'resources','[]')) loop
 if not exists(select 1 from public.training_asset where id=(resource#>>'{}')::uuid and config_version_id=config) then raise exception 'Training resource configuration mismatch';end if;
 end loop;
 for question in select value from jsonb_array_elements(assessment) loop
 if nullif(question->>'key','') is null or nullif(question->>'correct','') is null or coalesce(jsonb_typeof(question->'options'),'')<>'array' or jsonb_array_length(question->'options')<2 or nullif(question->'question'->>'en','') is null or nullif(question->'question'->>'ar','') is null or not exists(select 1 from jsonb_array_elements(question->'options') option where option->>'key'=question->>'correct') then raise exception 'Assessment question requires key, correct answer and options'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('training:'||module_key,0));
 select coalesce(max(tm.version),0)+1 into revision from public.training_module tm where tm.module_key=publish_training.module_key;
 insert into public.training_module(id,config_version_id,module_key,version,required,content,assessment,effective_at) values(target,config,module_key,revision,required,content,assessment,effective);
 for member in select * from public.membership where status='active' and 'producer'=any(roles) and (rules.cooperative_id is null or cooperative_id=rules.cooperative_id) loop
 insert into public.task(cooperative_id,user_id,kind,due_at,details,source_key) values(member.cooperative_id,member.user_id,'training',effective+interval '14 days',jsonb_build_object('module_id',target,'version',revision,'effective_at',effective),'training:'||target||':'||member.user_id);
 insert into public.notification(cooperative_id,user_id,kind,payload) values(member.cooperative_id,member.user_id,'training',jsonb_build_object('module_id',target,'effective_at',effective));
 end loop;return target;
end $$;
grant execute on function public.publish_training(text,jsonb,jsonb,boolean,uuid,timestamptz) to authenticated;

revoke all on function public.publish_training(text,jsonb,jsonb,boolean,uuid,timestamptz) from public,anon;

create or replace function public.register_training_asset(target uuid,config uuid,path text,title jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare object wise_storage.objects;scope uuid;asset public.training_asset;
begin
 if not private.has_role(array['admin']) or not private.can_access_training_config(config) or split_part(path,'/',1)<>config::text or split_part(split_part(path,'/',2),'.',1)<>target::text or length(coalesce(title->>'en',''))<2 or length(coalesce(title->>'ar',''))<2 then raise exception 'Training asset scope and bilingual title required';end if;
 select * into object from wise_storage.objects where bucket_id='training' and name=path;
 if object.id is null then raise exception 'Training upload not confirmed';end if;
 select cooperative_id into scope from public.config_version where id=config;
 select * into asset from public.training_asset where id=target;
 if asset.id is not null then
 if asset.config_version_id<>config or asset.storage_path<>path or asset.uploaded_by<>wise_auth.uid() then raise exception 'Training asset idempotency mismatch';end if;return to_jsonb(asset);
 end if;
 insert into public.training_asset(id,config_version_id,cooperative_id,title,storage_path,media_type,byte_size,uploaded_by) values(target,config,scope,title,path,object.metadata->>'mimetype',(object.metadata->>'size')::bigint,wise_auth.uid()) returning * into asset;
 return to_jsonb(asset);
end $$;
revoke all on function public.register_training_asset(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.register_training_asset(uuid,uuid,text,jsonb) to authenticated;
