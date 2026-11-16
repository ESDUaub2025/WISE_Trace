create table public.push_subscription(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.membership,
 cooperative_id uuid not null references public.cooperative,device_id uuid not null references public.device,
 subscription jsonb not null,enabled boolean not null default true,updated_at timestamptz not null default now(),
 unique(user_id,device_id)
);
alter table public.push_subscription enable row level security;
create policy own_push_subscription on public.push_subscription for select to authenticated using(user_id=wise_auth.uid());
grant select on public.push_subscription to authenticated;
create function public.register_push_subscription(device uuid,subscription jsonb,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare coop uuid;endpoint text:=subscription->>'endpoint';
begin
 select cooperative_id into coop from public.membership where user_id=wise_auth.uid() and status='active';
 if coop is null then raise exception 'Active account required';end if;
 perform private.require_device(device,coop);
 if enabled and (endpoint is null or length(endpoint)>4096 or endpoint !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)?push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)?notify\.windows\.com)/' or coalesce(subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87,88}={0,2}$' or coalesce(subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22,24}={0,2}$') then raise exception 'Invalid supported push subscription';end if;
 -- Switching the opted-in account on a shared device disables its old binding.
 if enabled then update public.push_subscription set enabled=false,updated_at=now() where device_id=device and user_id<>wise_auth.uid();end if;
 insert into public.push_subscription(user_id,cooperative_id,device_id,subscription,enabled) values(wise_auth.uid(),coop,device,jsonb_build_object('endpoint',endpoint),enabled)
 on conflict(user_id,device_id) do update set subscription=case when excluded.enabled then excluded.subscription else public.push_subscription.subscription end,enabled=excluded.enabled,updated_at=now();
end $$;
revoke all on function public.register_push_subscription(uuid,jsonb,boolean) from public,anon;
grant execute on function public.register_push_subscription(uuid,jsonb,boolean) to authenticated;

create table public.push_delivery(
 notification_id uuid not null references public.notification,subscription_id uuid not null references public.push_subscription,
 status text not null default 'pending' check(status in ('pending','sending','delivered','failed','expired')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),last_error text,delivered_at timestamptz,
 primary key(notification_id,subscription_id)
);
alter table public.push_delivery enable row level security;
revoke all on public.push_delivery from anon,authenticated;
create function private.queue_push_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.push_delivery(notification_id,subscription_id)
 select NEW.id,s.id from public.push_subscription s join public.membership m on m.user_id=s.user_id join public.device d on d.id=s.device_id
 where s.enabled and m.status='active' and d.revoked_at is null and s.cooperative_id=NEW.cooperative_id and (NEW.user_id is null or s.user_id=NEW.user_id);
 return NEW;
end $$;
revoke all on function private.queue_push_notification() from public,anon,authenticated;
create trigger queue_push_notification after insert on public.notification for each row execute function private.queue_push_notification();
create function public.claim_push_deliveries() returns setof jsonb language plpgsql security definer set search_path='' as $$
declare job record;
begin
 for job in select q.notification_id,q.subscription_id,s.subscription from public.push_delivery q join public.push_subscription s on s.id=q.subscription_id join public.membership m on m.user_id=s.user_id join public.device d on d.id=s.device_id
 where q.status in ('pending','sending','failed') and q.attempts<5 and q.next_attempt_at<=now() and s.enabled and m.status='active' and d.revoked_at is null
 order by q.next_attempt_at limit 20 for update of q skip locked loop
  update public.push_delivery set status='sending',attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' where notification_id=job.notification_id and subscription_id=job.subscription_id;
  return next jsonb_build_object('notification_id',job.notification_id,'subscription_id',job.subscription_id,'subscription',job.subscription);
 end loop;
end $$;
revoke all on function public.claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.claim_push_deliveries() to service_role;
