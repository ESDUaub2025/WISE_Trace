-- Read status belongs to a recipient, including for cooperative broadcasts.
create table public.notification_receipt(
 notification_id uuid not null references public.notification,
 user_id uuid not null references public.membership,
 read_at timestamptz not null default now(),
 primary key(notification_id,user_id)
);
alter table public.notification_receipt enable row level security;
create policy own_notification_receipts on public.notification_receipt for select to authenticated using(user_id=auth.uid());
grant select on public.notification_receipt to authenticated;
insert into public.notification_receipt select id,user_id,read_at from public.notification where user_id is not null and read_at is not null;
create or replace function public.notification_read(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notification where id=target and private.can_read(cooperative_id) and (user_id is null or user_id=auth.uid())) then raise exception 'Notification unavailable';end if;
 insert into public.notification_receipt(notification_id,user_id) values(target,auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.notification_read(uuid) from public,anon;
grant execute on function public.notification_read(uuid) to authenticated;

create table public.notification_preference(
 user_id uuid primary key references public.membership,
 channel text not null check(channel in ('sms','whatsapp')),
 destination text not null check(destination ~ '^\+[1-9][0-9]{7,14}$'),
 opted_in boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.notification_preference enable row level security;
create policy own_notification_preference on public.notification_preference for select to authenticated using(user_id=auth.uid());
grant select on public.notification_preference to authenticated;
create function private.audit_notification_preference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_event(cooperative_id,object_type,object_id,field,old_value,new_value,user_id)
 select cooperative_id,'notification_preference',NEW.user_id::text,'consent',case when TG_OP='INSERT' then null else jsonb_build_object('channel',OLD.channel,'opted_in',OLD.opted_in) end,jsonb_build_object('channel',NEW.channel,'opted_in',NEW.opted_in),auth.uid() from public.membership where user_id=NEW.user_id;
 return NEW;
end $$;
revoke all on function private.audit_notification_preference() from public,anon,authenticated;
create trigger audit_notification_preference after insert or update on public.notification_preference for each row execute function private.audit_notification_preference();
create function public.set_notification_preference(channel text,destination text,opted_in boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.membership where user_id=auth.uid() and status='active') then raise exception 'Active account required';end if;
 insert into public.notification_preference(user_id,channel,destination,opted_in) values(auth.uid(),channel,destination,opted_in)
 on conflict(user_id) do update set channel=excluded.channel,destination=excluded.destination,opted_in=excluded.opted_in,updated_at=now();
end $$;
revoke all on function public.set_notification_preference(text,text,boolean) from public,anon;
grant execute on function public.set_notification_preference(text,text,boolean) to authenticated;

-- Only saved consent and a real critical alert may prepare external delivery.
create function public.prepare_notification_delivery(target uuid,recipient uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.notification;p public.notification_preference;m public.membership;
begin
 if not private.has_role(array['admin','food_safety','supervisor']) then raise exception 'Alert delivery permission required';end if;
 select * into n from public.notification where id=target;
 if n.id is null or not private.can_read(n.cooperative_id) or n.kind not in ('recall','critical_deviation','held_whey_expiry') then raise exception 'Critical alert unavailable';end if;
 select * into m from public.membership where user_id=recipient and cooperative_id=n.cooperative_id and status='active';
 if m.user_id is null or (n.user_id is not null and n.user_id<>recipient) then raise exception 'Recipient outside alert scope';end if;
 select * into p from public.notification_preference where user_id=recipient and opted_in;
 if p.user_id is null then raise exception 'Saved recipient opt-in required';end if;
 return jsonb_build_object('notification_id',n.id,'recipient_id',recipient,'channel',p.channel,'destination',p.destination,'kind',n.kind);
end $$;
revoke all on function public.prepare_notification_delivery(uuid,uuid) from public,anon;
grant execute on function public.prepare_notification_delivery(uuid,uuid) to authenticated;
