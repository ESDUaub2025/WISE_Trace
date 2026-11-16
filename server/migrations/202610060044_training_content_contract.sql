alter function public.publish_training(text,jsonb,jsonb,boolean,uuid,timestamptz) rename to publish_training_validated_v42;
alter function public.publish_training_validated_v42(text,jsonb,jsonb,boolean,uuid,timestamptz) set schema private;
revoke all on function private.publish_training_validated_v42(text,jsonb,jsonb,boolean,uuid,timestamptz) from public,anon,authenticated;

create function public.publish_training(module_key text,content jsonb,assessment jsonb,required boolean,config uuid,effective timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare section text;entry jsonb;field text;question jsonb;answer jsonb;
begin
 if not private.has_role(array['admin']) then raise exception 'Admin AAL2 required';end if;
 if effective is null or required is null or jsonb_typeof(content) is distinct from 'object' then raise exception 'Training content and effective date required';end if;
 if content ? 'title' and (length(coalesce(content->'title'->>'en',''))<2 or length(coalesce(content->'title'->>'ar',''))<2) then raise exception 'Bilingual training title required';end if;
 foreach section in array array['steps','faqs','troubleshooting','resources'] loop
  if content ? section and jsonb_typeof(content->section) is distinct from 'array' then raise exception 'Training sections must be arrays';end if;
  if section='resources' then continue;end if;
  for entry in select value from jsonb_array_elements(coalesce(content->section,'[]')) loop
   foreach field in array case section when 'steps' then array['title','text'] when 'faqs' then array['question','answer'] else array['issue','action'] end loop
    if nullif(trim(entry->field->>'en'),'') is null or nullif(trim(entry->field->>'ar'),'') is null then raise exception 'Bilingual training section required';end if;
   end loop;
  end loop;
 end loop;
 if jsonb_typeof(assessment) is distinct from 'array' then raise exception 'Assessment must be an array';end if;
 if exists(select 1 from jsonb_array_elements(assessment) q group by q->>'key' having count(*)>1) then raise exception 'Duplicate assessment question';end if;
 for question in select value from jsonb_array_elements(assessment) loop
  if jsonb_typeof(question->'options') is distinct from 'array' then raise exception 'Assessment options must be an array';end if;
  if exists(select 1 from jsonb_array_elements(question->'options') a group by a->>'key' having count(*)>1) then raise exception 'Duplicate assessment option';end if;
  for answer in select value from jsonb_array_elements(question->'options') loop
   if nullif(trim(answer->>'key'),'') is null or nullif(trim(answer->'label'->>'en'),'') is null or nullif(trim(answer->'label'->>'ar'),'') is null then raise exception 'Bilingual keyed assessment options required';end if;
  end loop;
 end loop;
 return private.publish_training_validated_v42(module_key,content,assessment,required,config,effective);
end $$;
revoke all on function public.publish_training(text,jsonb,jsonb,boolean,uuid,timestamptz) from public,anon;
grant execute on function public.publish_training(text,jsonb,jsonb,boolean,uuid,timestamptz) to authenticated;

create function private.complete_training_tasks() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.task set status='resolved' where user_id=new.user_id and details->>'module_id'=new.module_id::text and kind in ('training','training_due') and status='open';
 return new;
end $$;
revoke all on function private.complete_training_tasks() from public,anon,authenticated;
create trigger complete_training_tasks after insert on public.training_completion for each row execute function private.complete_training_tasks();
