create index if not exists lot_observed_scope on public.lot(cooperative_id,observed_at);
create function public.cache_lot_ids() returns uuid[] language sql stable security invoker set search_path='' as $$
 with recursive selected(id) as (
 select l.id from public.lot l where l.observed_at>=date_trunc('month',now())-interval '90 days' or l.type='batch' and l.state in ('draft','in_production','awaiting_review','on_hold') or l.type in ('whey','ingredient','packaging_material','packaging') and public.lot_available(l.id)>0
 union select c.input_lot_id from public.consumption c join selected s on c.output_lot_id=s.id
 ) select coalesce(array_agg(id),'{}'::uuid[]) from selected;
$$;
revoke all on function public.cache_lot_ids() from public,anon;
grant execute on function public.cache_lot_ids() to authenticated;
create function public.snapshot_bootstrap(table_name text,after_key text default null,page_size integer default 1000) returns setof jsonb language plpgsql stable security invoker set search_path='' as $$
declare ids uuid[];col text;key_type text;condition text:='true';begin
 if not private.has_role(array['producer','supervisor','manager','admin','food_safety','partner']) or private.has_role(array['donor']) then raise exception 'Snapshot permission required';end if;
 if table_name not in ('lot','supplier','task','operational_record','deviation','equipment','training_module','training_completion','packaging_detail','sale','recall','notification','audit_event','membership','device','config_version','consumption','stage_event','attachment','cooperative','training_asset','material_disposition') or page_size not between 1 and 1000 then raise exception 'Invalid bootstrap table or page size';end if;
 ids:=public.cache_lot_ids();col:=case when table_name='membership' then 'user_id' when table_name='packaging_detail' then 'lot_id' else 'id' end;key_type:=case when table_name='audit_event' then 'bigint' else 'uuid' end;
 condition:=case
 when table_name='lot' then 'id=any($1)'
 when table_name in ('operational_record','deviation','stage_event','material_disposition','packaging_detail') then 'lot_id=any($1) or lot_id is null and observed_at>=date_trunc(''month'',now())-interval ''90 days'''
 when table_name='sale' then 'packaging_lot_id=any($1)'
 when table_name='consumption' then 'output_lot_id=any($1)'
 when table_name='attachment' then 'record_id=any($1) or record_id in(select id from public.operational_record where lot_id=any($1)) or created_at>=date_trunc(''month'',now())-interval ''90 days'''
 when table_name='audit_event' then 'recorded_at>=date_trunc(''month'',now())-interval ''90 days'' or object_id in(select unnest($1)::text) or object_id in(select id::text from public.operational_record where lot_id=any($1))'
 when table_name='task' then 'status=''open'' or due_at>=date_trunc(''month'',now())-interval ''90 days'''
 when table_name='recall' then 'status<>''closed'' or started_at>=date_trunc(''month'',now())-interval ''90 days'''
 when table_name='notification' then 'created_at>=date_trunc(''month'',now())-interval ''90 days'''
 else 'true' end;
 if table_name='packaging_detail' then condition:='lot_id=any($1)';end if;
 return query execute format('select to_jsonb(row) from public.%I row where (%s) and ($2 is null or %I>$2::%s) order by %I limit $3',table_name,condition,col,key_type,col) using ids,after_key,page_size;
end $$;
revoke all on function public.snapshot_bootstrap(text,text,integer) from public,anon;
grant execute on function public.snapshot_bootstrap(text,text,integer) to authenticated;
