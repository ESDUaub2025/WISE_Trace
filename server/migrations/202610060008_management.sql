create function public.manage_cooperative(target uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.has_role(array['admin']) then raise exception 'Admin AAL2 required'; end if;
 insert into public.cooperative(id,code,name,region,contacts,sites,status,joined_on) values(target,payload->>'code',payload->>'name',payload->>'region',coalesce(payload->'contacts','{}'),coalesce(payload->'sites','[]'),coalesce(payload->>'status','active'),coalesce((payload->>'joined_on')::date,current_date)) on conflict(id) do update set name=excluded.name,region=excluded.region,contacts=excluded.contacts,sites=excluded.sites,status=excluded.status;
end $$;
create function public.manage_account(target uuid,status text,roles text[],authorizations jsonb,reason text) returns void language plpgsql security definer set search_path='' as $$ declare m public.membership; begin
 select * into m from public.membership where user_id=target;
 if not private.can_operate(m.cooperative_id,array['admin','manager']) or length(reason)<3 then raise exception 'Account management denied'; end if;
 if not private.has_role(array['admin']) and not roles<@array['producer','supervisor','manager']::text[] then raise exception 'Managers cannot grant global roles'; end if;
 perform set_config('wise.reason',reason,true);update public.membership set status=manage_account.status,roles=manage_account.roles,authorizations=manage_account.authorizations where user_id=target;
end $$;
create function public.record_consent(sex text,age_band text,consent boolean) returns void language plpgsql security definer set search_path='' as $$ declare m public.membership; begin
 select * into m from public.membership where user_id=wise_auth.uid() and status='active';if m.user_id is null then raise exception 'Account unavailable'; end if;
 insert into public.producer_profile(user_id,cooperative_id,sex,age_band,consent_at,withdrawn_at) values(m.user_id,m.cooperative_id,case when consent then sex else null end,case when consent then age_band else null end,case when consent then now() else null end,case when not consent then now() else null end) on conflict(user_id) do update set sex=excluded.sex,age_band=excluded.age_band,consent_at=excluded.consent_at,withdrawn_at=excluded.withdrawn_at;
end $$;
create function public.grant_training_exception(target uuid,reason text,expires timestamptz,supervised boolean) returns void language plpgsql security definer set search_path='' as $$ declare m public.membership; begin
 select * into m from public.membership where user_id=target;
 if not private.can_operate(m.cooperative_id,array['admin']) or length(reason)<3 or expires<=now() then raise exception 'Training exception denied'; end if;
 insert into public.training_exception(cooperative_id,user_id,granted_by,reason,expires_at,supervised) values(m.cooperative_id,target,wise_auth.uid(),reason,expires,supervised);
end $$;
create function public.notification_read(target uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 update public.notification set read_at=now() where id=target and private.can_read(cooperative_id) and (user_id is null or user_id=wise_auth.uid());end $$;
create function public.convert_complaint(target uuid,severity text,device uuid) returns uuid language plpgsql security definer set search_path='' as $$ declare c public.complaint; result uuid:=gen_random_uuid();begin
 select * into c from public.complaint where id=target and deviation_id is null for update;
 if c.id is null or not private.can_operate(c.cooperative_id,array['supervisor','food_safety']) then raise exception 'Complaint review denied'; end if;
 perform private.require_device(device,c.cooperative_id);
 insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,author_id,device_id,observed_at) values(result,c.cooperative_id,c.lot_id,'complaint',severity,c.message,wise_auth.uid(),device,now());update public.complaint set deviation_id=result where id=target;return result;end $$;
grant execute on function public.manage_cooperative(uuid,jsonb),public.manage_account(uuid,text,text[],jsonb,text),public.record_consent(text,text,boolean),public.grant_training_exception(uuid,text,timestamptz,boolean),public.notification_read(uuid),public.convert_complaint(uuid,text,uuid) to authenticated;
