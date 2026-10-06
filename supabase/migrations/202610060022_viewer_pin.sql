create or replace function public.pin_signoff(pin text,device uuid,action text,object_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.membership; secret private.user_pin; result uuid;
begin
 select * into m from public.membership where user_id=auth.uid() and status='active';
 if m.user_id is null then raise exception 'Account unavailable'; end if;
 if action='cache_session' and object_id=m.user_id then
 if not exists(select 1 from public.device d where d.id=device and d.cooperative_id=m.cooperative_id and d.revoked_at is null) then raise exception 'Device revoked or unregistered'; end if;
 else perform private.require_device(device,m.cooperative_id); end if;
 select * into secret from private.user_pin where user_id=m.user_id for update;
 if secret.pin_hash is null or secret.blocked_until>now() then return null; end if;
 if pin !~ '^[0-9]{4,6}$' or extensions.crypt(pin,secret.pin_hash)<>secret.pin_hash then
 update private.user_pin set failed_attempts=failed_attempts+1,blocked_until=case when failed_attempts>=4 then now()+interval '15 minutes' else null end where user_id=m.user_id;
 return null;
 end if;
 update private.user_pin set failed_attempts=0,blocked_until=null where user_id=m.user_id;
 insert into public.signoff(user_id,cooperative_id,device_id,action,object_id) values(m.user_id,m.cooperative_id,device,action,object_id) returning id into result;
 return result;
end $$;
