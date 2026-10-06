create or replace function public.material_balances() returns setof jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',l.id,'unit',l.unit,'received',l.initial_quantity,'accepted',case when coalesce(d.outcome,l.state)='accepted' then l.initial_quantity else 0 end,'rejected',case when coalesce(d.outcome,l.state)='rejected' then l.initial_quantity else 0 end,'on_hold',case when coalesce(d.outcome,l.state)='hold' then l.initial_quantity else 0 end,
 'allocated',coalesce((select sum(c.quantity) from public.consumption c where c.input_lot_id=l.id),0),
 'disposed',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='disposed' and not exists(select 1 from public.material_disposition md where md.id=m.id and md.kind='diverted')),0),
 'diverted',coalesce((select sum(md.quantity) from public.material_disposition md where md.lot_id=l.id and md.kind='diverted'),0),
 'lost',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='lost'),0),
 'measurement_difference',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='adjusted'),0),
 'remaining',public.lot_available(l.id),
 'valorized',case when coalesce(d.outcome,l.state)='accepted' then coalesce((select sum(c.quantity) from public.consumption c join public.lot b on b.id=c.output_lot_id where c.input_lot_id=l.id and b.type='batch' and b.state<>'rejected' and exists(select 1 from public.lot_state_event se where se.lot_id=b.id and se.state='released')),0) else 0 end)
 from public.lot l left join lateral(select outcome from public.decision where lot_id=l.id order by recorded_at desc,id desc limit 1) d on true where l.type in ('whey','ingredient','packaging_material') order by l.id;
$$;
revoke all on function public.material_balances() from public,anon;
grant execute on function public.material_balances() to authenticated;
