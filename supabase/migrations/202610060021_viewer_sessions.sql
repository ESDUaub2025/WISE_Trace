-- Viewers need a registered device for PIN session verification without operational rights.
create or replace function public.register_device(target uuid,label text) returns void language plpgsql security definer set search_path='' as $$ declare m public.membership; begin
 select * into m from public.membership where user_id=auth.uid() and status='active';
 if m.cooperative_id is null or not private.has_role(array['producer','supervisor','manager','admin','food_safety','partner','donor']) then raise exception 'Device registration denied'; end if;
 if exists(select 1 from public.device where id=target and (cooperative_id<>m.cooperative_id or revoked_at is not null)) then raise exception 'Device revoked or belongs to another cooperative'; end if;
 insert into public.device(id,cooperative_id,label,registered_by) values(target,m.cooperative_id,left(label,120),m.user_id) on conflict(id) do nothing;
end $$;
create policy own_device_read on public.device for select to authenticated using(registered_by=auth.uid());
