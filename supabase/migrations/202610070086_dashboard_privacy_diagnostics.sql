create function public.dashboard_products() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.membership;result jsonb;begin
 select * into m from public.membership where user_id=auth.uid() and status='active';
 if m.user_id is null or not private.has_role(array['supervisor','manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 select coalesce(jsonb_agg(p),'[]') into result from (select distinct coalesce(c.definition->>'product_key',c.definition->'label_template'->'product'->>'en') key,c.definition->'label_template'->'product' label from public.config_version c where c.kind='sop' and c.status in ('approved','retired') and (m.roles&&array['admin','food_safety','partner','donor'] or c.cooperative_id is null or c.cooperative_id=m.cooperative_id) and c.definition->'label_template'->'product' is not null) p;
 return result;
end $$;
create function public.participation_demographics(cooperative_filter uuid,region_filter text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.membership;result jsonb;begin
 select * into m from public.membership where user_id=auth.uid() and status='active';
 if m.user_id is null or not private.has_role(array['manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 if not(m.roles&&array['admin','food_safety','partner','donor']) and cooperative_filter is not null and cooperative_filter<>m.cooperative_id then raise exception 'Cooperative outside dashboard scope';end if;
 with consenting as (select p.sex,p.age_band from public.producer_profile p join public.membership u on u.user_id=p.user_id join public.cooperative c on c.id=u.cooperative_id where p.consent_at is not null and p.withdrawn_at is null and u.status='active' and 'producer'=any(u.roles) and not coalesce((u.authorizations->>'test_data')::boolean,false) and (m.roles&&array['admin','food_safety','partner','donor'] or u.cooperative_id=m.cooperative_id) and (cooperative_filter is null or u.cooperative_id=cooperative_filter) and (region_filter is null or c.region=region_filter)), groups as (
 select 'sex' dimension,case when sex in ('female','male') then sex else 'other' end category,count(*) count from consenting where sex is not null group by 2
 union all select 'age_band',case when age_band in ('18-24','25-34','35-44','45-54','55-64','65+') then age_band else 'other' end,count(*) from consenting where age_band is not null group by 2)
 select coalesce(jsonb_agg(jsonb_build_object('dimension',dimension,'category',category,'value',case when count>=5 then count else null end,'suppressed',count<5)),'[]') into result from groups;
 return result;
end $$;
revoke all on function public.dashboard_products(),public.participation_demographics(uuid,text) from public,anon;
grant execute on function public.dashboard_products(),public.participation_demographics(uuid,text) to authenticated;

create table public.client_diagnostic(id uuid primary key,cooperative_id uuid not null references public.cooperative,user_id uuid not null references public.membership,device_id uuid not null references public.device,code text not null check(code in ('client_error','unhandled_rejection','sync_failure')),screen text not null,observed_at timestamptz not null,recorded_at timestamptz not null default now());
alter table public.client_diagnostic enable row level security;
create policy diagnostic_read on public.client_diagnostic for select to authenticated using(private.can_operate(cooperative_id,array['admin','manager','food_safety']));
grant select on public.client_diagnostic to authenticated;
create function public.record_client_diagnostic(target uuid,device uuid,code text,screen text,observed timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare m public.membership;begin
 select * into m from public.membership where user_id=auth.uid() and status='active';
 if m.user_id is null or not exists(select 1 from public.device d where d.id=$2 and d.registered_by=m.user_id and d.cooperative_id=m.cooperative_id and d.revoked_at is null) then raise exception 'Registered active device required';end if;
 if screen not in ('home','whey','batches','inventory','review','deviations','recall','training','equipment','dashboards','reports','organization','admin','public') or observed>now()+interval '5 minutes' then raise exception 'Invalid diagnostic context';end if;
 if (select count(*) from public.client_diagnostic d where d.user_id=m.user_id and d.recorded_at>now()-interval '1 hour')>=100 then return;end if;
 insert into public.client_diagnostic(id,cooperative_id,user_id,device_id,code,screen,observed_at) values(target,m.cooperative_id,m.user_id,device,code,screen,observed) on conflict(id) do nothing;
end $$;
revoke all on function public.record_client_diagnostic(uuid,uuid,text,text,timestamptz) from public,anon;
grant execute on function public.record_client_diagnostic(uuid,uuid,text,text,timestamptz) to authenticated;
