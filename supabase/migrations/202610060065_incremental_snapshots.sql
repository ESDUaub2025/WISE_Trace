-- Journal contains keys only. Actual row bodies are read under the caller's RLS.
-- PostgreSQL transaction visibility handles sequence holes from concurrent commits.
create table private.snapshot_epoch(id uuid primary key default gen_random_uuid());
insert into private.snapshot_epoch default values;
create table private.snapshot_change(
 revision bigint generated always as identity primary key,
 table_name text not null,row_key text not null,cooperative_id uuid,
 transaction_id xid8 not null,balance_lots uuid[] not null default '{}'
);
create index snapshot_change_transaction on private.snapshot_change(transaction_id,revision);
revoke all on private.snapshot_epoch,private.snapshot_change from public,anon,authenticated;

create function private.journal_snapshot_change() returns trigger language plpgsql security definer set search_path='' as $$
declare current_row jsonb;previous_row jsonb;scope uuid;old_scope uuid;key_value text;targets uuid[]:='{}';target uuid;
begin
 current_row:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 previous_row:=case when TG_OP='UPDATE' then to_jsonb(OLD) else null end;
 key_value:=current_row->>case TG_TABLE_NAME when 'membership' then 'user_id' when 'packaging_detail' then 'lot_id' else 'id' end;
 scope:=(current_row->>'cooperative_id')::uuid;
 old_scope:=(previous_row->>'cooperative_id')::uuid;
 if TG_TABLE_NAME='cooperative' then scope:=key_value::uuid;old_scope:=scope;end if;
 if TG_TABLE_NAME='training_module' then
  select cooperative_id into scope from public.config_version where id=(current_row->>'config_version_id')::uuid;
  select cooperative_id into old_scope from public.config_version where id=(previous_row->>'config_version_id')::uuid;
 end if;
 if TG_TABLE_NAME='lot' then
  target:=key_value::uuid;
  select coalesce(array_agg(input_lot_id),'{}') into targets from public.consumption where output_lot_id=target;
  targets:=targets||target;
 elsif TG_TABLE_NAME in ('consumption','inventory_movement','material_disposition','decision','amendment') then
  foreach key_value in array array['input_lot_id','output_lot_id','lot_id','object_id'] loop
   if current_row->>key_value is not null then targets:=targets||(current_row->>key_value)::uuid;end if;
  end loop;
  key_value:=current_row->>'id';
 end if;
 if TG_OP='UPDATE' and old_scope is distinct from scope then
  insert into private.snapshot_change(table_name,row_key,cooperative_id,transaction_id,balance_lots) values(TG_TABLE_NAME,key_value,old_scope,pg_current_xact_id(),targets);
 end if;
 insert into private.snapshot_change(table_name,row_key,cooperative_id,transaction_id,balance_lots) values(TG_TABLE_NAME,key_value,scope,pg_current_xact_id(),targets);
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function private.journal_snapshot_change() from public,anon,authenticated;
do $$declare table_name text;begin
 foreach table_name in array array['lot','supplier','task','operational_record','deviation','equipment','training_module','training_completion','packaging_detail','sale','recall','notification','audit_event','membership','device','config_version','consumption','stage_event','attachment','cooperative','training_asset','material_disposition','inventory_movement','decision','amendment'] loop
  execute format('create trigger snapshot_journal after insert or update or delete on public.%I for each row execute function private.journal_snapshot_change()',table_name);
 end loop;
end $$;

create function public.snapshot_checkpoint() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member public.membership;
begin
 select * into member from public.membership where user_id=auth.uid();
 if member.user_id is null or member.status<>'active' then raise exception 'accountDisabled';end if;
 if not private.has_role(array['producer','supervisor','manager','admin','food_safety','partner','donor']) then raise exception 'sessionExpired';end if;
 return jsonb_build_object('snapshot',pg_current_snapshot()::text,'epoch',(select id from private.snapshot_epoch),'access',md5(jsonb_build_array(member.cooperative_id,member.roles,member.authorizations,member.status)::text),'identity',jsonb_build_object('cooperative_id',member.cooperative_id,'roles',member.roles,'authorizations',member.authorizations,'status',member.status));
end $$;
revoke all on function public.snapshot_checkpoint() from public,anon;
grant execute on function public.snapshot_checkpoint() to authenticated;

create function private.snapshot_keys(from_snapshot text,to_snapshot text,after_revision bigint,page_size integer) returns setof private.snapshot_change language plpgsql stable security definer set search_path='' as $$
declare previous pg_snapshot;target pg_snapshot;
begin
 if not private.has_role(array['producer','supervisor','manager','admin','food_safety','partner']) or private.has_role(array['donor']) then raise exception 'Snapshot permission required';end if;
 if length(from_snapshot)>65536 or length(to_snapshot)>65536 or page_size not between 1 and 500 or after_revision<0 then raise exception 'Invalid snapshot cursor';end if;
 previous:=from_snapshot::pg_snapshot;target:=to_snapshot::pg_snapshot;
 return query select change.* from private.snapshot_change change where change.revision>after_revision
  and change.transaction_id>=pg_snapshot_xmin(previous)
  and not pg_visible_in_snapshot(change.transaction_id,previous)
  and pg_visible_in_snapshot(change.transaction_id,target)
  and (private.can_read(change.cooperative_id) or (change.cooperative_id is null and change.table_name in ('config_version','training_module','training_asset')))
  order by change.revision limit page_size+1;
end $$;
revoke all on function private.snapshot_keys(text,text,bigint,integer) from public,anon;
grant execute on function private.snapshot_keys(text,text,bigint,integer) to authenticated;

-- Invoker is deliberate: the key journal does not grant access to record bodies.
create function public.snapshot_changes(from_snapshot text,to_snapshot text,after_revision text default '0',page_size integer default 500) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare change private.snapshot_change;body jsonb;changes jsonb:='[]';position bigint:=0;count_rows integer:=0;column_name text;key_type text;
begin
 if after_revision!~'^[0-9]{1,19}$' then raise exception 'Invalid snapshot cursor';end if;
 for change in select * from private.snapshot_keys(from_snapshot,to_snapshot,after_revision::bigint,page_size) loop
  count_rows:=count_rows+1;if count_rows>page_size then exit;end if;
  if change.table_name not in ('lot','supplier','task','operational_record','deviation','equipment','training_module','training_completion','packaging_detail','sale','recall','notification','audit_event','membership','device','config_version','consumption','stage_event','attachment','cooperative','training_asset','material_disposition','inventory_movement','decision','amendment') then raise exception 'Invalid snapshot table';end if;
  column_name:=case change.table_name when 'membership' then 'user_id' when 'packaging_detail' then 'lot_id' else 'id' end;
  key_type:=case when change.table_name='audit_event' then 'bigint' else 'uuid' end;
  execute format('select to_jsonb(record) from public.%I record where %I=$1::%s',change.table_name,column_name,key_type) into body using change.row_key;
  changes:=changes||jsonb_build_array(jsonb_build_object('table',change.table_name,'key',change.row_key,'row',body,'balance_lots',change.balance_lots));
  position:=change.revision;
 end loop;
 return jsonb_build_object('changes',changes,'after_revision',position::text,'complete',count_rows<=page_size);
end $$;
revoke all on function public.snapshot_changes(text,text,text,integer) from public,anon;
grant execute on function public.snapshot_changes(text,text,text,integer) to authenticated;

-- Preserve the latest classification when a material lot closes.
create function public.snapshot_material_balances(targets uuid[]) returns setof jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',l.id,'unit',l.unit,'received',l.initial_quantity,'accepted',case when coalesce(d.outcome,l.state)='accepted' then l.initial_quantity else 0 end,'rejected',case when coalesce(d.outcome,l.state)='rejected' then l.initial_quantity else 0 end,'on_hold',case when coalesce(d.outcome,l.state)='hold' then l.initial_quantity else 0 end,
 'allocated',coalesce((select sum(c.quantity) from public.consumption c where c.input_lot_id=l.id),0),
 'disposed',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='disposed' and not exists(select 1 from public.material_disposition md where md.id=m.id and md.kind='diverted')),0),
 'diverted',coalesce((select sum(md.quantity) from public.material_disposition md where md.lot_id=l.id and md.kind='diverted'),0),
 'lost',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='lost'),0),
 'measurement_difference',coalesce((select sum(-m.quantity) from public.inventory_movement m where m.lot_id=l.id and m.type='adjusted'),0),
 'remaining',public.lot_available(l.id),
 'valorized',case when coalesce(d.outcome,l.state)='accepted' then coalesce((select sum(c.quantity) from public.consumption c join public.lot b on b.id=c.output_lot_id where c.input_lot_id=l.id and b.type='batch' and b.state<>'rejected' and exists(select 1 from public.lot_state_event se where se.lot_id=b.id and se.state='released')),0) else 0 end)
 from public.lot l left join lateral(select outcome from (select outcome,recorded_at,id::text tie from public.decision where lot_id=l.id union all select coalesce(changes->>'decision',changes->>'state'),recorded_at,id::text from public.amendment where object_id=l.id and coalesce(changes->>'decision',changes->>'state') in ('accepted','hold','rejected') union all select state,observed_at,id::text from public.lot_state_event where lot_id=l.id and state in ('received','accepted','hold','rejected')) history order by recorded_at desc,tie desc limit 1) d on true where l.id=any(targets) and l.type in ('whey','ingredient','packaging_material') order by l.id;
$$;
revoke all on function public.snapshot_material_balances(uuid[]) from public,anon;
grant execute on function public.snapshot_material_balances(uuid[]) to authenticated;

create function public.snapshot_balances(targets uuid[]) returns setof jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',l.id,'available',public.lot_available(l.id),'material',material.value)
 from public.lot l left join lateral(select value from public.snapshot_material_balances(array[l.id]) value) material on true
 where l.id=any(targets) and cardinality(targets)<=1000 order by l.id;
$$;
revoke all on function public.snapshot_balances(uuid[]) from public,anon;
grant execute on function public.snapshot_balances(uuid[]) to authenticated;
