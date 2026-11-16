create table public.alert_delivery(
 notification_id uuid not null references public.notification,recipient_id uuid not null references public.membership,
 status text not null default 'pending' check(status in ('pending','sending','delivered','logged','failed')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),last_error text,delivered_at timestamptz,
 primary key(notification_id,recipient_id)
);
alter table public.alert_delivery enable row level security;
revoke all on public.alert_delivery from anon,authenticated;
create function private.queue_critical_alert() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if NEW.kind in ('recall','critical_deviation','held_whey_expiry') then
 insert into public.alert_delivery(notification_id,recipient_id)
 select NEW.id,m.user_id from public.membership m join public.notification_preference p on p.user_id=m.user_id
 where m.status='active' and p.opted_in and (NEW.user_id is null and m.cooperative_id=NEW.cooperative_id or NEW.user_id=m.user_id) on conflict do nothing;
 end if;return NEW;
end $$;
create trigger queue_critical_alert after insert on public.notification for each row execute function private.queue_critical_alert();
create function public.claim_alert_deliveries() returns setof jsonb language plpgsql security definer set search_path='' as $$
declare job record;begin
 for job in select q.notification_id,q.recipient_id,n.kind,p.channel,p.destination from public.alert_delivery q join public.notification n on n.id=q.notification_id join public.membership m on m.user_id=q.recipient_id join public.notification_preference p on p.user_id=m.user_id
 where q.status in ('pending','sending','failed') and q.attempts<5 and q.next_attempt_at<=now() and m.status='active' and p.opted_in order by q.next_attempt_at limit 20 for update of q skip locked loop
 update public.alert_delivery set status='sending',attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' where notification_id=job.notification_id and recipient_id=job.recipient_id;
 return next to_jsonb(job);
 end loop;
end $$;
revoke all on function public.claim_alert_deliveries() from public,anon,authenticated;
grant execute on function public.claim_alert_deliveries() to service_role;
