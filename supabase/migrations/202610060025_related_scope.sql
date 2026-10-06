-- Security-definer writers still validate every referenced lot against cooperative scope.
create function private.enforce_related_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare doc jsonb:=to_jsonb(NEW); field text; target uuid;
begin
 foreach field in array array['lot_id','packaging_lot_id','batch_id','packaging_material_id','trigger_lot_id'] loop
 if nullif(doc->>field,'') is not null then
 target:=(doc->>field)::uuid;
 if not exists(select 1 from public.lot where id=target and cooperative_id=NEW.cooperative_id) then raise exception 'Related lot cooperative mismatch'; end if;
 end if;
 end loop;
 if nullif(doc->>'owner_id','') is not null and not exists(select 1 from public.membership where user_id=(doc->>'owner_id')::uuid and cooperative_id=NEW.cooperative_id) then raise exception 'Responsible user cooperative mismatch'; end if;
 return NEW;
end $$;
do $$ declare entity text;begin
 foreach entity in array array['operational_record','deviation','packaging_detail','sale','inventory_movement','recall','recall_scope','decision','amendment'] loop
 execute format('create trigger related_scope before insert or update on public.%I for each row execute function private.enforce_related_scope()',entity);
 end loop;
end $$;
