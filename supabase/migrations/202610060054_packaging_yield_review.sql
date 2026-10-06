create function private.review_packaging_yield() returns trigger language plpgsql security definer set search_path='' as $$
declare batch public.lot;pack public.lot;rules jsonb;input_mass numeric;output_mass numeric;ratio numeric;reason text;
begin
 if auth.uid() is null then return new;end if;
 select * into batch from public.lot where id=new.batch_id;
 select * into pack from public.lot where id=new.lot_id;
 select definition into rules from public.config_version where id=batch.config_version_id;
 if rules->'expected_yield' is null then return new;end if;
 select coalesce(sum(c.quantity),0) into input_mass from public.consumption c join public.lot l on l.id=c.input_lot_id where c.output_lot_id=batch.id and l.type in ('whey','ingredient') and c.unit='kg';
 select sum(pd.size_kg*pd.package_count) into output_mass from public.packaging_detail pd where pd.batch_id=batch.id;
 ratio:=case when input_mass>0 then output_mass/input_mass else null end;
 if ratio is null or ratio<(rules->'expected_yield'->>'min')::numeric or ratio>(rules->'expected_yield'->>'max')::numeric then
  if rules->'expected_yield'->>'action'='blocking' then raise exception 'Packaging yield outside configured range';end if;
  reason:=current_setting('wise.reason',true);if length(coalesce(reason,''))<5 then raise exception 'Packaging yield warning requires justification';end if;
  insert into public.deviation(id,cooperative_id,lot_id,category,severity,issue,detected_value,corrective_action,author_id,device_id,observed_at) values(gen_random_uuid(),batch.cooperative_id,batch.id,'packaging_yield','major','Packaging mass ratio outside configured range',jsonb_build_object('input_mass_kg',input_mass,'packaged_mass_kg',output_mass,'ratio',ratio,'packaging_lot_id',new.lot_id),reason,auth.uid(),pack.device_id,pack.observed_at);
  insert into public.task(cooperative_id,lot_id,kind,due_at,details,source_key) values(batch.cooperative_id,batch.id,'review_task',now(),jsonb_build_object('reason','packaging_yield','packaging_lot_id',new.lot_id),'yield:'||new.lot_id);
 end if;
 return new;
end $$;
revoke all on function private.review_packaging_yield() from public,anon,authenticated;
create trigger review_packaging_yield after insert on public.packaging_detail for each row execute function private.review_packaging_yield();
