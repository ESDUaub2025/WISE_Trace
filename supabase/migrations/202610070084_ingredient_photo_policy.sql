create function private.require_ingredient_photos() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.outcome='released' and exists(select 1 from public.consumption used join public.lot input on input.id=used.input_lot_id join public.config_version c on c.id=input.config_version_id where used.output_lot_id=NEW.lot_id and input.type='ingredient' and coalesce((c.definition->>'ingredient_photo_required')::boolean,false) and not exists(select 1 from public.attachment a where a.record_id=input.id and a.media_type like 'image/%')) then raise exception 'Configured ingredient photograph required before release';end if;
 return NEW;
end $$;
create trigger require_ingredient_photos before insert on public.decision for each row execute function private.require_ingredient_photos();
