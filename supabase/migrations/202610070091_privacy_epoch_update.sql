create or replace function public.anonymize_producer(target uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare m public.membership;begin
 select * into m from public.membership where user_id=target for update;
 if m.user_id is null or not private.can_operate(m.cooperative_id,array['manager','admin']) or m.status<>'disabled' or not m.roles<@array['producer','supervisor']::text[] or length(trim(reason))<3 then raise exception 'Disable the producer and record the verified request before anonymizing';end if;
 perform set_config('wise.reason',reason,true);
 update public.membership set username='anon_'||replace(target::text,'-',''),display_name='Anonymous producer',authorizations='{}',anonymized_at=now() where user_id=target;
 update public.producer_profile set sex=null,age_band=null,consent_at=null,withdrawn_at=now() where user_id=target;
 delete from public.notification_preference where user_id=target;
 update public.push_subscription set enabled=false where user_id=target;
 update private.snapshot_epoch set id=gen_random_uuid() where id=(select id from private.snapshot_epoch limit 1);
end $$;
