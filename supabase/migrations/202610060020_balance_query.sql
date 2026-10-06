-- RLS applies to the lot list; each balance remains scoped by lot_available.
create function public.lot_balances() returns table(id uuid,available numeric)
language sql stable security invoker set search_path='' as $$
 select l.id,public.lot_available(l.id) from public.lot l
$$;
grant execute on function public.lot_balances() to authenticated;
