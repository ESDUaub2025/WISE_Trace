create table public.material_disposition(
 id uuid primary key references public.inventory_movement,
 cooperative_id uuid not null references public.cooperative,lot_id uuid not null references public.lot,
 kind text not null check(kind in ('disposed','diverted','lost','measurement_difference')),
 quantity numeric not null check(quantity>0),unit text not null,
 method text not null check(length(method)>=3),destination text,reason text not null,
 closes_lot boolean not null default false,author_id uuid not null references public.membership,
 device_id uuid not null references public.device,observed_at timestamptz not null,recorded_at timestamptz not null default now()
);
alter table public.material_disposition enable row level security;
revoke all on public.material_disposition from public,anon,authenticated;
grant select on public.material_disposition to authenticated;
create policy material_disposition_read on public.material_disposition for select to authenticated using(private.can_read(cooperative_id));
create trigger immutable before update or delete on public.material_disposition for each row execute function private.immutable();
create trigger audit after insert on public.material_disposition for each row execute function private.audit_row();

create function private.record_material_disposition(eid uuid,coop uuid,dev uuid,cfg uuid,observed timestamptz,p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare l public.lot;q numeric;movement text;
begin
 select * into l from public.lot where id=(p->>'lot_id')::uuid and cooperative_id=coop for update;
 q:=(p->>'quantity')::numeric;
 if l.id is null or l.type not in ('whey','ingredient','packaging_material') or l.state='closed' or l.config_version_id<>cfg or q is null or q<=0 or q::text in ('NaN','Infinity') or p->>'unit' is distinct from l.unit or length(coalesce(p->>'method',''))<3 or length(coalesce(p->>'reason',''))<3 or coalesce(p->>'kind','') not in ('disposed','diverted','lost','measurement_difference') then raise exception 'Material disposition facts required';end if;
 if p->>'kind'='diverted' and length(coalesce(p->>'destination',''))<3 then raise exception 'Diversion destination required';end if;
 if l.unit='unit' and q<>trunc(q) then raise exception 'Whole material units required';end if;
 if q>public.lot_available(l.id) then raise exception 'Disposition exceeds available stock';end if;
 movement:=case p->>'kind' when 'measurement_difference' then 'adjusted' when 'lost' then 'lost' else 'disposed' end;
 insert into public.inventory_movement values(eid,coop,l.id,movement,-q,l.unit,p->>'reason',wise_auth.uid(),dev,observed,now());
 if coalesce((p->>'close_lot')::boolean,false) and public.lot_available(l.id)<>0 then raise exception 'Record all residual stock before closing';end if;
 insert into public.material_disposition values(eid,coop,l.id,p->>'kind',q,l.unit,p->>'method',nullif(p->>'destination',''),p->>'reason',coalesce((p->>'close_lot')::boolean,false),wise_auth.uid(),dev,observed,now());
 if coalesce((p->>'close_lot')::boolean,false) then
  perform set_config('wise.transition','authorized',true);update public.lot set state='closed' where id=l.id;
 end if;
end $$;
revoke all on function private.record_material_disposition(uuid,uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;

create function public.material_balances() returns setof jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',l.id,'unit',l.unit,'received',l.initial_quantity,'accepted',case when d.outcome='accepted' then l.initial_quantity else 0 end,'rejected',case when d.outcome='rejected' then l.initial_quantity else 0 end,'on_hold',case when d.outcome='hold' then l.initial_quantity else 0 end,
 'allocated',coalesce((select sum(c.quantity) from public.consumption c where c.input_lot_id=l.id),0),
 'disposed',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='disposed'),0),
 'diverted',coalesce((select sum(md.quantity) from public.material_disposition md where md.lot_id=l.id and md.kind='diverted'),0),
 'lost',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='lost'),0),
 'measurement_difference',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='adjusted'),0),
 'remaining',public.lot_available(l.id),
 'valorized',case when d.outcome='accepted' then coalesce((select sum(c.quantity) from public.consumption c join public.lot b on b.id=c.output_lot_id where c.input_lot_id=l.id and b.type='batch' and b.state<>'rejected' and exists(select 1 from public.lot_state_event se where se.lot_id=b.id and se.state='released')),0) else 0 end)
 from public.lot l left join lateral(select outcome from public.decision where lot_id=l.id order by recorded_at desc,id desc limit 1) d on true where l.type in ('whey','ingredient','packaging_material');
$$;
revoke all on function public.material_balances() from public,anon;
grant execute on function public.material_balances() to authenticated;
