create or replace function public.manage_registry(entity text,target uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare coop uuid:=(payload->>'cooperative_id')::uuid;
begin
 if not private.can_operate(coop,array['admin']) then raise exception 'Admin permission required';end if;
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
create or replace function private.can_operate(coop uuid,wanted text[]) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(wanted) and exists(select 1 from public.cooperative where id=coop and status='active') and exists(select 1 from public.membership m where m.user_id=wise_auth.uid() and (m.cooperative_id=coop or m.roles && array['admin','food_safety']));
$$;
