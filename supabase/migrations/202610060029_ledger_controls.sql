create function private.validate_ledger_adjustment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.type='adjusted' and auth.uid() is not null and not private.can_operate(NEW.cooperative_id,array['supervisor','manager']) then raise exception 'Stock adjustments require supervisor or manager'; end if;
 return NEW;
end $$;
create trigger ledger_adjustment before insert on public.inventory_movement for each row execute function private.validate_ledger_adjustment();
create function private.validate_whole_units() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.quantity<>trunc(NEW.quantity) then raise exception 'Packaging transactions require whole units'; end if;return NEW;
end $$;
create trigger whole_units before insert on public.sale for each row execute function private.validate_whole_units();
create function private.validate_package_count() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.package_count<>(select initial_quantity from public.lot where id=NEW.lot_id) then raise exception 'Package count must be a whole number'; end if;
 if not exists(select 1 from public.lot where id=NEW.packaging_material_id and type='packaging_material' and unit='unit') then raise exception 'Packaging material lot required'; end if;
 return NEW;
end $$;
create trigger package_count before insert on public.packaging_detail for each row execute function private.validate_package_count();
