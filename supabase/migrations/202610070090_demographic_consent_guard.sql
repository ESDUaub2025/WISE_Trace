create or replace function public.participation_demographics(cooperative_filter uuid,region_filter text) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
