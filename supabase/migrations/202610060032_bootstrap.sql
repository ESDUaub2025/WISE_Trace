create function public.bootstrap_installation(coop uuid,details jsonb,accounts jsonb,configuration jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare account jsonb; administrator uuid; draft uuid:=gen_random_uuid();
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service role only'; end if;
 if exists(select 1 from public.membership) or exists(select 1 from public.cooperative) then raise exception 'Bootstrap requires an empty installation'; end if;
 if jsonb_array_length(accounts)<>2 or not exists(select 1 from jsonb_array_elements(accounts) a where a->>'role'='admin') or not exists(select 1 from jsonb_array_elements(accounts) a where a->>'role'='food_safety') then raise exception 'Separate Admin and Food-Safety Lead required'; end if;
 perform set_config('wise.reason','Controlled initial installation bootstrap',true);
 insert into public.cooperative(id,code,name,region,contacts,sites) values(coop,details->>'code',details->>'name',details->>'region',coalesce(details->'contacts','{}'),coalesce(details->'sites','[]'));
 for account in select value from jsonb_array_elements(accounts) loop
 perform public.provision_membership((account->>'id')::uuid,coop,account->>'username',account->>'display_name',array[account->>'role'],'{}',account->>'pin',(account->>'id')::uuid);
 if account->>'role'='admin' then administrator:=(account->>'id')::uuid;end if;
 end loop;
 insert into public.config_version(id,kind,version,effective_at,status,placeholder,definition,drafted_by) values(draft,'sop',1,now(),'draft',true,configuration,administrator);
 return draft;
end $$;
grant execute on function public.bootstrap_installation(uuid,jsonb,jsonb,jsonb) to service_role;
drop policy evidence_insert on storage.objects;
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='evidence' and private.can_operate((storage.foldername(name))[1]::uuid,array['producer','supervisor','manager','food_safety']));
