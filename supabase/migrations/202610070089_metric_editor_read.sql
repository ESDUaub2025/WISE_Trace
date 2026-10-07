create function public.metric_dictionary() returns setof public.kpi_definition language plpgsql stable security definer set search_path='' as $$begin
 if not private.has_role(array['admin','food_safety']) then raise exception 'Configuration permission required';end if;
 return query select * from private.metric_dictionary(now()) order by id;
end $$;
revoke all on function public.metric_dictionary() from public,anon;
grant execute on function public.metric_dictionary() to authenticated;
