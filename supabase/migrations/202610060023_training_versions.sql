alter table public.training_module add column effective_at timestamptz not null default '-infinity';
create function public.publish_training(module_key text,content jsonb,assessment jsonb,required boolean,config uuid,effective timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=gen_random_uuid(); revision integer; question jsonb; member public.membership;
begin
 if not private.has_role(array['admin']) then raise exception 'Admin AAL2 required'; end if;
 if length(module_key)<2 or length(content->>'en')<20 or length(content->>'ar')<20 or jsonb_typeof(assessment)<>'array' or jsonb_array_length(assessment)=0 or effective<now() then raise exception 'Bilingual versioned content, assessment and future effective date required'; end if;
 if not exists(select 1 from public.config_version where id=config and status='approved') then raise exception 'Approved configuration required'; end if;
 for question in select value from jsonb_array_elements(assessment) loop
 if nullif(question->>'key','') is null or nullif(question->>'correct','') is null or jsonb_typeof(question->'options')<>'array' then raise exception 'Assessment question requires key, correct answer and options'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('training:'||module_key,0));
 select coalesce(max(tm.version),0)+1 into revision from public.training_module tm where tm.module_key=publish_training.module_key;
 insert into public.training_module(id,config_version_id,module_key,version,required,content,assessment,effective_at) values(target,config,module_key,revision,required,content,assessment,effective);
 for member in select * from public.membership where status='active' and 'producer'=any(roles) loop
 insert into public.task(cooperative_id,user_id,kind,due_at,details,source_key) values(member.cooperative_id,member.user_id,'training',effective+interval '14 days',jsonb_build_object('module_id',target,'version',revision),'training:'||target||':'||member.user_id);
 insert into public.notification(cooperative_id,user_id,kind,payload) values(member.cooperative_id,member.user_id,'training',jsonb_build_object('module_id',target,'effective_at',effective));
 end loop;return target;
end $$;
grant execute on function public.publish_training(text,jsonb,jsonb,boolean,uuid,timestamptz) to authenticated;
