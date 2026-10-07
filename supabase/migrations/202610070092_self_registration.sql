alter table public.cooperative add column service_plan text not null default 'full' check(service_plan in ('trial','full'));
create table public.registration_request(
 user_id uuid primary key references auth.users(id), username text not null unique,
 display_name text not null, workspace_name text not null, region text not null,
 requested_plan text not null check(requested_plan in ('trial','full')),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 cooperative_id uuid references public.cooperative, reviewed_by uuid references public.membership,
 review_reason text, requested_at timestamptz not null default now(), reviewed_at timestamptz
);
create table private.registration_pin(user_id uuid primary key references public.registration_request on delete cascade, pin_hash text not null);
alter table public.registration_request enable row level security;
create policy registration_read on public.registration_request for select to authenticated using(user_id=auth.uid() or private.has_role(array['admin']));
grant select on public.registration_request to authenticated;
revoke all on public.registration_request from anon;

create function public.request_registration(account_username text, account_name text, workspace_name text, workspace_region text, account_pin text, requested_plan text)
returns void language plpgsql security definer set search_path='' as $$
declare person uuid:=auth.uid();
begin
 if person is null or not exists(select 1 from auth.users where id=person and email_confirmed_at is not null and deleted_at is null) then raise exception 'Confirmed email required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(person::text,0));
 if exists(select 1 from public.membership where user_id=person) then raise exception 'Account already registered'; end if;
 if account_username is null or account_name is null or workspace_name is null or workspace_region is null or account_pin is null or requested_plan is null then raise exception 'Invalid registration details'; end if;
 if account_username !~ '^[a-z0-9._-]{3,40}$' or length(trim(account_name)) not between 2 and 100 or length(trim(workspace_name)) not between 3 and 100 or length(trim(workspace_region)) not between 2 and 100 or account_pin !~ '^[0-9]{4,6}$' or requested_plan not in ('trial','full') then raise exception 'Invalid registration details'; end if;
 if exists(select 1 from public.membership where username=account_username) then raise exception 'Username unavailable'; end if;
 insert into public.registration_request(user_id,username,display_name,workspace_name,region,requested_plan) values(person,account_username,trim(account_name),trim(workspace_name),trim(workspace_region),requested_plan)
 on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,workspace_name=excluded.workspace_name,region=excluded.region,requested_plan=excluded.requested_plan,status='pending',reviewed_by=null,review_reason=null,reviewed_at=null,requested_at=now();
 insert into private.registration_pin(user_id,pin_hash) values(person,extensions.crypt(account_pin,extensions.gen_salt('bf',12))) on conflict(user_id) do update set pin_hash=excluded.pin_hash;
end $$;

create function public.review_registration(target uuid, outcome text, plan text, reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare request public.registration_request; coop uuid:=gen_random_uuid();
begin
 if not private.has_role(array['admin']) or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Admin AAL2 required'; end if;
 if outcome not in ('approved','rejected') or plan not in ('trial','full') or outcome is null or plan is null or length(trim(coalesce(reason,'')))<3 then raise exception 'Invalid review details'; end if;
 select * into request from public.registration_request where user_id=target for update;
 if request.user_id is null or request.status<>'pending' then raise exception 'Pending request required'; end if;
 if outcome='approved' then
 if exists(select 1 from public.membership where user_id=target) then raise exception 'Account already registered'; end if;
 perform set_config('wise.reason',reason,true);
 insert into public.cooperative(id,code,name,region,service_plan) values(coop,'W'||upper(substr(replace(coop::text,'-',''),1,11)),request.workspace_name,request.region,plan);
 insert into public.membership(user_id,cooperative_id,username,display_name,roles,authorizations) values(target,coop,request.username,request.display_name,array['manager','producer'],'{"receive_whey":true}');
 insert into private.user_pin(user_id,pin_hash) select target,pin_hash from private.registration_pin where user_id=target;
 if not found then raise exception 'Registration PIN missing'; end if;
 delete from private.registration_pin where user_id=target;
 insert into public.audit_event(cooperative_id,object_type,object_id,field,new_value,user_id,reason) values(coop,'membership',target::text,'registered',jsonb_build_object('roles',array['manager','producer'],'service_plan',plan),auth.uid(),reason);
 else coop:=null;end if;
 update public.registration_request set status=outcome,cooperative_id=coop,reviewed_by=auth.uid(),review_reason=reason,reviewed_at=now() where user_id=target;
 return coop;
end $$;
revoke all on function public.request_registration(text,text,text,text,text,text),public.review_registration(uuid,text,text,text) from public,anon;
grant execute on function public.request_registration(text,text,text,text,text,text),public.review_registration(uuid,text,text,text) to authenticated;

create function private.trial_membership_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.cooperative_id is not null and exists(select 1 from public.cooperative where id=new.cooperative_id and service_plan='trial') and exists(select 1 from public.membership where cooperative_id=new.cooperative_id and user_id<>new.user_id) then raise exception 'Trial workspace is limited to one account'; end if;
 return new;
end $$;
create trigger trial_membership_limit before insert or update on public.membership for each row execute function private.trial_membership_limit();

create function public.upgrade_workspace(target uuid, reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['admin']) or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Admin AAL2 required'; end if;
 if length(trim(coalesce(reason,'')))<3 then raise exception 'Reason required'; end if;
 perform set_config('wise.reason',reason,true);
 update public.cooperative set service_plan='full' where id=target and service_plan='trial';
 if not found then raise exception 'Trial workspace required'; end if;
 insert into public.audit_event(cooperative_id,object_type,object_id,field,old_value,new_value,user_id,reason) values(target,'cooperative',target::text,'service_plan','"trial"','"full"',auth.uid(),reason);
end $$;
revoke all on function public.upgrade_workspace(uuid,text) from public,anon;
grant execute on function public.upgrade_workspace(uuid,text) to authenticated;

-- Approved workspace founders can register their own materials and instruments.
create or replace function public.manage_registry(entity text,target uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare coop uuid:=(payload->>'cooperative_id')::uuid;
begin
 if not (private.can_operate(coop,array['admin']) or (private.can_operate(coop,array['manager']) and exists(select 1 from public.registration_request where user_id=auth.uid() and cooperative_id=coop and status='approved'))) then raise exception 'Admin permission required';end if;
 if entity='supplier' then
 if payload->>'type' not in ('dairy','bulgur','salt','ingredient','packaging') or payload->>'status' not in ('approved','provisional','suspended') or length(trim(payload->>'name'))<2 then raise exception 'Invalid supplier';end if;
 if exists(select 1 from public.supplier where id=target and cooperative_id<>coop) then raise exception 'Registry cooperative cannot change';end if;
 insert into public.supplier values(target,coop,payload->>'name',payload->>'type',payload->>'status',coalesce(payload->'contacts','{}'),coalesce(payload->'declarations','{}')) on conflict(id) do update set name=excluded.name,type=excluded.type,status=excluded.status,contacts=excluded.contacts,declarations=excluded.declarations;
 elsif entity='equipment' then
 if payload->>'status' not in ('active','inactive') or length(trim(payload->>'label'))<2 or length(trim(payload->>'type'))<2 then raise exception 'Invalid equipment';end if;
 if exists(select 1 from public.equipment where id=target and cooperative_id<>coop) then raise exception 'Registry cooperative cannot change';end if;
 insert into public.equipment values(target,coop,payload->>'label',payload->>'type',nullif(payload->>'calibrated_at','')::timestamptz,nullif(payload->>'next_due_at','')::timestamptz,payload->>'status') on conflict(id) do update set label=excluded.label,type=excluded.type,calibrated_at=excluded.calibrated_at,next_due_at=excluded.next_due_at,status=excluded.status;
 else raise exception 'Registry not supported';end if;
end $$;
