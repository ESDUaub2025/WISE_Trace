alter function public.impact_metrics(date,date) set schema private;
revoke all on function private.impact_metrics(date,date) from public,anon,authenticated;
create function public.impact_metrics(from_date date,to_date date) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_role(array['manager','admin','food_safety','partner','donor']) then raise exception 'Dashboard permission required';end if;
 if from_date is null or to_date is null or from_date>to_date then raise exception 'Invalid reporting period';end if;
 return query select * from private.impact_metrics(from_date,to_date);
end $$;
revoke all on function public.impact_metrics(date,date) from public,anon;
grant execute on function public.impact_metrics(date,date) to authenticated;
