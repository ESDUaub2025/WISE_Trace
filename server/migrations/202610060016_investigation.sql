create function public.recall_trace(target uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare ids uuid[]; result jsonb; begin
 select array_agg(distinct g.id) into ids from public.genealogy(target,'back') ancestor cross join lateral public.genealogy(ancestor.id,'forward') g where ancestor.type='whey' or ancestor.id=target;
 select jsonb_build_object('lots',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'code',l.code,'type',l.type,'state',l.state,'stock',public.lot_available(l.id))) from public.lot l where l.id=any(ids)),'[]'),'allocations',coalesce((select jsonb_agg(c) from public.consumption c where c.output_lot_id=any(ids) or c.input_lot_id=any(ids)),'[]'),'sales',coalesce((select jsonb_agg(s) from public.sale s where s.packaging_lot_id=any(ids)),'[]'),'source_whey',coalesce((select jsonb_agg(a) from public.genealogy(target,'back') a where a.type='whey'),'[]')) into result;
 return result;
end $$;
grant execute on function public.recall_trace(uuid) to authenticated;
