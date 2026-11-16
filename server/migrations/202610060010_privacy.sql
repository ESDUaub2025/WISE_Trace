alter table public.cooperative add column partner_operational_consent boolean not null default false;
create or replace function private.can_read(coop uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.membership m where m.user_id=wise_auth.uid() and m.status='active' and not ('donor'=any(m.roles)) and (m.cooperative_id=coop or m.roles && array['admin','food_safety'] or ('partner'=any(m.roles) and exists(select 1 from public.cooperative c where c.id=coop and c.partner_operational_consent))) and (not(m.roles && array['admin','food_safety']) or wise_auth.jwt()->>'aal'='aal2'));
$$;
