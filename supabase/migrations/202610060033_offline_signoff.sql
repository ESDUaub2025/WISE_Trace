create table private.offline_credential(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.membership,device_id uuid not null references public.device,cooperative_id uuid not null references public.cooperative,secret bytea not null,issued_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz);
revoke all on private.offline_credential from public,anon,authenticated;
create function public.issue_offline_credential(device uuid,sign uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare member public.membership; credential private.offline_credential; days integer;
begin
 select * into member from public.membership where user_id=auth.uid() and status='active';
 if not private.can_operate(member.cooperative_id,array['producer','supervisor']) or not ('supervisor'=any(member.roles) or coalesce((member.authorizations->>'receive_whey')::boolean,false)) then raise exception 'Offline receiving authorization required'; end if;
 perform private.require_device(device,member.cooperative_id);perform private.consume_signoff(sign,'cache_session',member.user_id);
 select coalesce((definition->>'session_offline_days')::integer,7) into days from public.config_version where status='approved' and kind='sop' and effective_at<=now() and (cooperative_id is null or cooperative_id=member.cooperative_id) order by (cooperative_id is not null) desc,version desc limit 1;
 insert into private.offline_credential(user_id,device_id,cooperative_id,secret,expires_at) values(member.user_id,device,member.cooperative_id,extensions.gen_random_bytes(32),now()+make_interval(days=>greatest(1,least(coalesce(days,7),30)))) returning * into credential;
 return jsonb_build_object('id',credential.id,'secret',encode(credential.secret,'hex'),'expires_at',credential.expires_at);
end $$;
grant execute on function public.issue_offline_credential(uuid,uuid) to authenticated;
create function private.verify_offline_whey(envelope jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare credential private.offline_credential; p jsonb:=envelope->'payload'; message text; expected text; sign uuid:=gen_random_uuid();member public.membership;
begin
 select * into credential from private.offline_credential where id=(p->>'credential_id')::uuid;
 select * into member from public.membership where user_id=auth.uid() and status='active';
 if credential.id is null or credential.user_id<>auth.uid() or credential.device_id::text<>envelope->>'device_id' or credential.cooperative_id::text<>envelope->>'cooperative_id' or credential.revoked_at is not null or credential.expires_at<now() or (envelope->>'observed_at')::timestamptz<credential.issued_at or (envelope->>'observed_at')::timestamptz>credential.expires_at then raise exception 'Offline credential expired or unavailable; supervisor review required'; end if;
 if not private.can_operate(credential.cooperative_id,array['producer','supervisor']) or not ('supervisor'=any(member.roles) or coalesce((member.authorizations->>'receive_whey')::boolean,false)) then raise exception 'Receiving authorization no longer valid'; end if;
 if not exists(select 1 from public.lot where id=(p->>'lot_id')::uuid and type='whey' and cooperative_id=credential.cooperative_id and device_id=credential.device_id and config_version_id::text=envelope->>'config_version_id') then raise exception 'Offline whey decision requires the receiving device and original SOP'; end if;
 message:=concat_ws(E'\n',envelope->>'id',envelope->>'cooperative_id',envelope->>'author_id',envelope->>'device_id',envelope->>'config_version_id',p->>'lot_id',envelope->>'observed_at',p->>'outcome',p->>'reason');
 expected:=encode(extensions.hmac(convert_to(message,'UTF8'),credential.secret,'sha256'),'hex');
 if p->>'proof' is null or p->>'proof' !~ '^[a-f0-9]{64}$' or extensions.digest(p->>'proof','sha256')<>extensions.digest(expected,'sha256') then raise exception 'Offline signature invalid'; end if;
 insert into public.signoff(id,user_id,cooperative_id,device_id,action,object_id) values(sign,auth.uid(),credential.cooperative_id,credential.device_id,'decision',(p->>'lot_id')::uuid);return sign;
end $$;
revoke all on function private.verify_offline_whey(jsonb) from public,anon,authenticated;
