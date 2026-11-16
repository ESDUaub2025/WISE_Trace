alter table public.membership add column anonymized_at timestamptz;
create function public.anonymize_producer(target uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare m public.membership;begin
 select * into m from public.membership where user_id=target for update;
 if m.user_id is null or not private.can_operate(m.cooperative_id,array['manager','admin']) or m.status<>'disabled' or not m.roles<@array['producer','supervisor']::text[] or length(trim(reason))<3 then raise exception 'Disable the producer and record the verified request before anonymizing';end if;
 perform set_config('wise.reason',reason,true);
 update public.membership set username='anon_'||replace(target::text,'-',''),display_name='Anonymous producer',authorizations='{}',anonymized_at=now() where user_id=target;
 update public.producer_profile set sex=null,age_band=null,consent_at=null,withdrawn_at=now() where user_id=target;
 delete from public.notification_preference where user_id=target;
 update public.push_subscription set enabled=false where user_id=target;
 update private.snapshot_epoch set id=gen_random_uuid();
end $$;
revoke all on function public.anonymize_producer(uuid,text) from public,anon;
grant execute on function public.anonymize_producer(uuid,text) to authenticated;
-- Demographic history follows the same restrictions as the profile itself.
-- Identity history for anonymized producers remains in the protected immutable
-- archive but is never returned to app roles or included in their exports.
drop policy audit_read on public.audit_event;
create policy audit_read on public.audit_event for select to authenticated using(
 private.can_read(cooperative_id)
 and (object_type<>'producer_profile' or object_id=wise_auth.uid()::text or private.has_role(array['admin']))
 and not(object_type='membership' and field in ('username','display_name') and exists(select 1 from public.membership m where m.user_id::text=object_id and m.anonymized_at is not null))
);
