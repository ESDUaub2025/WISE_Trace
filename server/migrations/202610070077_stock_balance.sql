create function public.finished_stock_balance(target uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare l public.lot;produced numeric;sold numeric;removed numeric;returns numeric;adjustments numeric;remaining numeric;tolerance numeric;begin
 select * into l from public.lot where id=target and type='packaging';if l.id is null then raise exception 'Packaging lot unavailable';end if;
 select coalesce(sum(quantity) filter(where type='produced'),0),-coalesce(sum(quantity) filter(where type in ('sold','distributed')),0),-coalesce(sum(quantity) filter(where type in ('lost','disposed','sample')),0),coalesce(sum(quantity) filter(where type='returned'),0),coalesce(sum(quantity) filter(where type='adjusted'),0) into produced,sold,removed,returns,adjustments from public.inventory_movement where lot_id=target;
 remaining:=public.lot_available(target);select greatest(0,coalesce((definition->>'inventory_tolerance_units')::numeric,0)) into tolerance from public.config_version where id=l.config_version_id;
 return jsonb_build_object('produced',produced,'sold_distributed',sold,'removed_lost',removed,'returned',returns,'adjusted',adjustments,'in_stock',remaining,'difference',produced+returns+adjustments-sold-removed-remaining,'tolerance',tolerance,'balanced',abs(produced+returns+adjustments-sold-removed-remaining)<=tolerance);
end $$;
revoke all on function public.finished_stock_balance(uuid) from public,anon;
grant execute on function public.finished_stock_balance(uuid) to authenticated;
