create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table public.cooperative (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 region text not null, contacts jsonb not null default '{}', sites jsonb not null default '[]',
 status text not null default 'active' check(status in ('active','inactive')), joined_on date not null default current_date
);
create table public.membership (
 user_id uuid primary key references wise_auth.users(id), cooperative_id uuid references public.cooperative,
 username text not null unique check(username ~ '^[a-z0-9._-]{3,40}$'), display_name text not null,
 roles text[] not null, authorizations jsonb not null default '{}', status text not null default 'active' check(status in ('active','disabled')),
 created_at timestamptz not null default now(),
 check(roles <@ array['producer','supervisor','manager','admin','food_safety','partner','donor']::text[])
);
create table private.user_pin(user_id uuid primary key references public.membership, pin_hash text not null, failed_attempts integer not null default 0, blocked_until timestamptz);
create table public.producer_profile(user_id uuid primary key references public.membership, cooperative_id uuid not null references public.cooperative, sex text, age_band text, consent_at timestamptz, withdrawn_at timestamptz);
create table public.device(id uuid primary key, cooperative_id uuid not null references public.cooperative, label text not null, registered_by uuid not null references public.membership, revoked_at timestamptz, last_sync_at timestamptz);
create table public.supplier(id uuid primary key, cooperative_id uuid not null references public.cooperative, name text not null, type text not null, status text not null default 'provisional' check(status in ('approved','provisional','suspended')), contacts jsonb not null default '{}', declarations jsonb not null default '{}');
create table public.config_version(
 id uuid primary key default gen_random_uuid(), cooperative_id uuid references public.cooperative,
 kind text not null, version integer not null check(version > 0), effective_at timestamptz not null,
 status text not null default 'draft' check(status in ('draft','approved','retired')),
 placeholder boolean not null default true, definition jsonb not null,
 drafted_by uuid references public.membership, approved_by uuid references public.membership,
 approved_at timestamptz, unique nulls not distinct (cooperative_id,kind,version),
 check(approved_by is null or approved_by is distinct from drafted_by)
);
create table public.training_module(id uuid primary key default gen_random_uuid(), config_version_id uuid not null references public.config_version, module_key text not null, version integer not null, required boolean not null default true, content jsonb not null, assessment jsonb not null default '[]', unique(module_key,version));
create table public.training_completion(id uuid primary key, cooperative_id uuid not null references public.cooperative, user_id uuid not null references public.membership, module_id uuid not null references public.training_module, completed_at timestamptz not null, score numeric not null check(score between 0 and 100), expires_at timestamptz);
create table public.training_exception(id uuid primary key default gen_random_uuid(), cooperative_id uuid not null references public.cooperative, user_id uuid not null references public.membership, granted_by uuid not null references public.membership, reason text not null check(length(reason)>2), expires_at timestamptz not null, supervised boolean not null default true);
create sequence public.lot_code_sequence;
create table public.lot(
 id uuid primary key, cooperative_id uuid not null references public.cooperative,
 type text not null check(type in ('whey','ingredient','packaging_material','batch','packaging')),
 code text not null unique, state text not null default 'received', unit text not null check(unit in ('kg','L','unit')),
 initial_quantity numeric not null check(initial_quantity >= 0),
 supplier_id uuid references public.supplier, producer_id uuid not null references public.membership,
 device_id uuid not null references public.device, config_version_id uuid not null references public.config_version,
 observed_at timestamptz not null, recorded_at timestamptz not null default now(),
 generation_at timestamptz, expires_at timestamptz, stage text,
 facts jsonb not null default '{}', revision integer not null default 1, wise_review boolean not null default false,
 unique(id,cooperative_id)
);
create table public.consumption(
 id uuid primary key, cooperative_id uuid not null references public.cooperative,
 input_lot_id uuid not null, output_lot_id uuid not null, quantity numeric not null check(quantity > 0), unit text not null,
 author_id uuid not null references public.membership, device_id uuid not null references public.device,
 observed_at timestamptz not null, recorded_at timestamptz not null default now(), reason text,
 foreign key(input_lot_id,cooperative_id) references public.lot(id,cooperative_id),
 foreign key(output_lot_id,cooperative_id) references public.lot(id,cooperative_id), check(input_lot_id <> output_lot_id)
);
create index consumption_input on public.consumption(input_lot_id);
create index consumption_output on public.consumption(output_lot_id);
create table public.inventory_movement(
 id uuid primary key, cooperative_id uuid not null references public.cooperative, lot_id uuid not null,
 type text not null check(type in ('produced','sold','distributed','sample','lost','disposed','returned','adjusted')),
 quantity numeric not null check(quantity <> 0), unit text not null, reason text,
 author_id uuid not null references public.membership, device_id uuid not null references public.device,
 observed_at timestamptz not null, recorded_at timestamptz not null default now(),
 foreign key(lot_id,cooperative_id) references public.lot(id,cooperative_id),
 check((type in ('produced','returned') and quantity > 0) or (type in ('sold','distributed','sample','lost','disposed') and quantity < 0) or (type='adjusted' and length(reason)>2))
);
create table public.operational_record(
 id uuid primary key, cooperative_id uuid not null references public.cooperative, lot_id uuid,
 kind text not null check(kind in ('checkpoint','measurement','checklist','storage_inspection','note','sample','lab','stage','handover','calibration','complaint')),
 definition_key text, config_version_id uuid not null references public.config_version, payload jsonb not null,
 author_id uuid not null references public.membership, device_id uuid not null references public.device,
 observed_at timestamptz not null, recorded_at timestamptz not null default now(), due_at timestamptz,
 late boolean generated always as (due_at is not null and observed_at > due_at) stored,
 foreign key(lot_id,cooperative_id) references public.lot(id,cooperative_id)
);
create table public.deviation(
 id uuid primary key, cooperative_id uuid not null references public.cooperative, lot_id uuid not null,
 category text not null, severity text not null check(severity in ('minor','major','critical')),
 issue text not null, detected_value jsonb, corrective_action text, preventive_action text, owner_id uuid references public.membership,
 due_at timestamptz, resolution text, closed_at timestamptz, reviewer_id uuid references public.membership,
 author_id uuid not null references public.membership, device_id uuid not null references public.device,
 observed_at timestamptz not null, recorded_at timestamptz not null default now(),
 foreign key(lot_id,cooperative_id) references public.lot(id,cooperative_id)
);
create table public.task(
 id uuid primary key default gen_random_uuid(), cooperative_id uuid not null references public.cooperative,
 lot_id uuid references public.lot, user_id uuid references public.membership, kind text not null,
 due_at timestamptz not null, status text not null default 'open' check(status in ('open','resolved')),
 details jsonb not null default '{}', source_key text unique
);
create table public.packaging_detail(
 lot_id uuid primary key, cooperative_id uuid not null references public.cooperative, batch_id uuid not null,
 packaging_material_id uuid not null references public.lot, package_type text not null, size_kg numeric not null check(size_kg>0),
 package_count integer not null check(package_count>0), mass_kg numeric not null check(mass_kg>0),
 best_before date not null, storage_location text not null, label jsonb not null,
 public_token text not null unique default encode(extensions.gen_random_bytes(24),'hex'),
 foreign key(lot_id,cooperative_id) references public.lot(id,cooperative_id), foreign key(batch_id,cooperative_id) references public.lot(id,cooperative_id),
 check(abs(mass_kg - size_kg*package_count)<0.001)
);
create table public.sale(
 id uuid primary key, cooperative_id uuid not null references public.cooperative, packaging_lot_id uuid not null references public.packaging_detail(lot_id),
 transaction_type text not null check(transaction_type in ('sale','consignment','donation','sample','internal_use','return')),
 quantity integer not null check(quantity>0), customer_category text not null, customer_contact jsonb,
 total numeric not null check(total>=0), currency text not null check(currency in ('USD','LBP')),
 usd_rate numeric not null check(usd_rate>0), author_id uuid not null references public.membership,
 device_id uuid not null references public.device, observed_at timestamptz not null, recorded_at timestamptz not null default now()
);
create table public.equipment(id uuid primary key, cooperative_id uuid not null references public.cooperative, label text not null, type text not null, calibrated_at timestamptz, next_due_at timestamptz, status text not null default 'active');
create table public.recall(id uuid primary key, cooperative_id uuid not null references public.cooperative, trigger_lot_id uuid not null references public.lot, mock boolean not null, reason text not null, public_notice jsonb not null default '{}', status text not null default 'open', author_id uuid not null references public.membership, started_at timestamptz not null default now(), completed_at timestamptz);
create table public.recall_scope(recall_id uuid not null references public.recall, lot_id uuid not null references public.lot, cooperative_id uuid not null references public.cooperative, primary key(recall_id,lot_id));
create table public.recall_action(id uuid primary key, recall_id uuid not null references public.recall, cooperative_id uuid not null references public.cooperative, action text not null, quantity numeric not null default 0 check(quantity>=0), notes text not null, author_id uuid not null references public.membership, recorded_at timestamptz not null default now());
create table public.notification(id uuid primary key default gen_random_uuid(), cooperative_id uuid not null references public.cooperative, user_id uuid references public.membership, kind text not null, payload jsonb not null, created_at timestamptz not null default now(), read_at timestamptz);
create table public.attachment(id uuid primary key, cooperative_id uuid not null references public.cooperative, record_id uuid not null, author_id uuid not null references public.membership, storage_path text not null, media_type text not null, ai_value jsonb, confidence numeric check(confidence between 0 and 1), confirmed_value jsonb, created_at timestamptz not null default now());
create table public.amendment(id uuid primary key, cooperative_id uuid not null references public.cooperative, object_id uuid not null, object_type text not null, changes jsonb not null, reason text not null check(length(reason)>2), author_id uuid not null references public.membership, device_id uuid not null references public.device, observed_at timestamptz not null, recorded_at timestamptz not null default now());
create table public.audit_event(
 id bigint generated always as identity primary key, cooperative_id uuid references public.cooperative,
 object_type text not null, object_id text not null, field text not null, old_value jsonb, new_value jsonb,
 user_id uuid, device_id uuid, observed_at timestamptz, recorded_at timestamptz not null default now(), reason text
);
create index audit_object on public.audit_event(object_type,object_id,recorded_at);
create table public.signoff(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.membership, cooperative_id uuid not null references public.cooperative, device_id uuid not null references public.device, action text not null, object_id uuid not null, expires_at timestamptz not null default now()+interval '2 minutes', used_at timestamptz);
create table public.decision(id uuid primary key, cooperative_id uuid not null references public.cooperative, lot_id uuid not null references public.lot, outcome text not null, reason text not null, user_id uuid not null references public.membership, signoff_id uuid not null references public.signoff, observed_at timestamptz not null, recorded_at timestamptz not null default now());
create table public.sync_receipt(id uuid primary key, cooperative_id uuid not null references public.cooperative, author_id uuid not null references public.membership, device_id uuid not null references public.device, action text not null, payload jsonb not null, status text not null check(status in ('synced','conflict')), error text, observed_at timestamptz not null, recorded_at timestamptz not null default now());
create table public.kpi_definition(id text primary key, label text not null, definition text not null, source text not null, calculation text not null, exclusions text not null, visibility text not null);

create function private.has_role(wanted text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.membership m where m.user_id=wise_auth.uid() and m.status='active' and m.roles && wanted and (not (m.roles && array['admin','food_safety']) or wise_auth.jwt()->>'aal'='aal2'));
$$;
create function private.can_read(coop uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.membership m where m.user_id=wise_auth.uid() and m.status='active' and not ('donor'=any(m.roles)) and (m.cooperative_id=coop or m.roles && array['admin','food_safety','partner']) and (not(m.roles && array['admin','food_safety']) or wise_auth.jwt()->>'aal'='aal2'));
$$;
create function private.can_operate(coop uuid,wanted text[]) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(wanted) and exists(select 1 from public.membership m where m.user_id=wise_auth.uid() and (m.cooperative_id=coop or m.roles && array['admin','food_safety']));
$$;
grant usage on schema private to authenticated;
grant execute on function private.has_role(text[]),private.can_read(uuid),private.can_operate(uuid,text[]) to authenticated;
do $$ declare t text; begin
 foreach t in array array['cooperative','membership','producer_profile','device','supplier','config_version','training_module','training_completion','training_exception','lot','consumption','inventory_movement','operational_record','deviation','task','packaging_detail','sale','equipment','recall','recall_scope','recall_action','notification','attachment','amendment','audit_event','signoff','decision','sync_receipt','kpi_definition'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['device','supplier','training_completion','training_exception','lot','consumption','inventory_movement','operational_record','deviation','task','packaging_detail','sale','equipment','recall','recall_scope','recall_action','attachment','amendment','decision','sync_receipt'] loop
 execute format('create policy scoped_read on public.%I for select to authenticated using (private.can_read(cooperative_id))',t);
 end loop;
end $$;
create policy org_read on public.cooperative for select to authenticated using(private.can_read(id));
create policy member_read on public.membership for select to authenticated using(user_id=wise_auth.uid() or private.can_read(cooperative_id));
create policy config_read on public.config_version for select to authenticated using((cooperative_id is null and private.has_role(array['producer','supervisor','manager','admin','food_safety','partner'])) or private.can_read(cooperative_id));
create policy training_read on public.training_module for select to authenticated using(private.has_role(array['producer','supervisor','manager','admin','food_safety','partner']));
create policy profile_read on public.producer_profile for select to authenticated using(user_id=wise_auth.uid() or private.can_operate(cooperative_id,array['admin']));
create policy notification_read on public.notification for select to authenticated using(private.can_read(cooperative_id) and (user_id is null or user_id=wise_auth.uid()));
create policy audit_read on public.audit_event for select to authenticated using(private.can_read(cooperative_id));
create policy signoff_read on public.signoff for select to authenticated using(user_id=wise_auth.uid());
create policy kpi_read on public.kpi_definition for select to authenticated using(wise_auth.uid() is not null);

create function private.immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Append-only record: use an amendment'; end $$;
do $$ declare t text; begin
 foreach t in array array['audit_event','consumption','inventory_movement','operational_record','sale','decision','amendment','sync_receipt','training_completion'] loop
 execute format('create trigger immutable before update or delete on public.%I for each row execute function private.immutable()',t);
 end loop;
end $$;
create function private.audit_row() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; item text;
begin
 before_row := case when TG_OP='INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
 after_row := case when TG_OP='DELETE' then '{}'::jsonb else to_jsonb(NEW) end;
 row_data := coalesce(nullif(after_row,'{}'),before_row);
 for item in select key from jsonb_object_keys(before_row || after_row) as keys(key) loop
 if before_row->item is distinct from after_row->item then
 insert into public.audit_event(cooperative_id,object_type,object_id,field,old_value,new_value,user_id,device_id,observed_at,reason)
 values((row_data->>'cooperative_id')::uuid,TG_TABLE_NAME,coalesce(row_data->>'id',row_data->>'user_id',row_data->>'lot_id'),item,before_row->item,after_row->item,wise_auth.uid(),(nullif(current_setting('wise.device_id',true),''))::uuid,(row_data->>'observed_at')::timestamptz,nullif(current_setting('wise.reason',true),''));
 end if; end loop;
 return coalesce(NEW,OLD);
end $$;
do $$ declare t text; begin
 foreach t in array array['cooperative','membership','producer_profile','device','supplier','config_version','training_module','training_completion','training_exception','lot','consumption','inventory_movement','operational_record','deviation','packaging_detail','sale','equipment','recall','recall_action','amendment','decision'] loop
 execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit_row()',t);
 end loop;
end $$;
create function private.lock_lot() returns trigger language plpgsql set search_path='' as $$
begin
 if OLD.state in ('released','rejected','recalled','withdrawn','closed') and current_setting('wise.transition',true) is distinct from 'authorized' then raise exception 'Locked lot: amendment required'; end if;
 if TG_OP='DELETE' then raise exception 'Lots cannot be deleted'; end if;
 NEW.revision := OLD.revision+1; return NEW;
end $$;
create trigger lock_lot before update or delete on public.lot for each row execute function private.lock_lot();

create function public.lot_available(target uuid) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce((select sum(quantity) from public.inventory_movement where lot_id=target),0)-coalesce((select sum(quantity) from public.consumption where input_lot_id=target),0);
$$;
create function public.genealogy(target uuid,direction text default 'forward') returns table(id uuid,code text,type text,state text,depth integer,available numeric) language sql stable security invoker set search_path='' as $$
 with recursive graph(lot_id,depth,path) as (
 select l.id,0,array[l.id] from public.lot l where l.id=target
 union all
 select case when direction='back' then c.input_lot_id else c.output_lot_id end,g.depth+1,g.path || case when direction='back' then c.input_lot_id else c.output_lot_id end
 from graph g join public.consumption c on (direction='back' and c.output_lot_id=g.lot_id) or (direction<>'back' and c.input_lot_id=g.lot_id)
 where not (case when direction='back' then c.input_lot_id else c.output_lot_id end=any(g.path))
 ) select l.id,l.code,l.type,l.state,min(g.depth),public.lot_available(l.id) from graph g join public.lot l on l.id=g.lot_id group by l.id;
$$;
create function private.check_consumption() returns trigger language plpgsql security definer set search_path='' as $$
declare source public.lot; destination public.lot; rules jsonb;
begin
 -- Stable lock ordering prevents deadlock between concurrent multi-lot allocations.
 perform 1 from public.lot where id in (NEW.input_lot_id,NEW.output_lot_id) order by id for update;
 select * into source from public.lot where id=NEW.input_lot_id;
 select * into destination from public.lot where id=NEW.output_lot_id;
 select definition into rules from public.config_version where id=destination.config_version_id;
 if source.cooperative_id<>destination.cooperative_id or source.cooperative_id<>NEW.cooperative_id then raise exception 'Cooperative mismatch'; end if;
 if source.state in ('hold','on_hold','rejected','recalled','withdrawn') then raise exception 'Input lot held, rejected or recalled'; end if;
 if source.type='whey' and source.state<>'accepted' then raise exception 'Whey must be accepted'; end if;
 if source.expires_at is not null and (source.expires_at<=NEW.observed_at or source.expires_at<=now()) then raise exception 'Input expired'; end if;
 if NEW.unit<>source.unit then raise exception 'Unsupported unit conversion'; end if;
 if destination.state not in ('draft','in_production','received','awaiting_review') then raise exception 'Output lot is locked for allocation'; end if;
 if source.type='batch' and destination.type='batch' and not coalesce((rules->>'blending_enabled')::boolean,false) then raise exception 'Blending disabled'; end if;
 if source.type='whey' and not coalesce((rules->>'multi_lot')::boolean,true) and exists(select 1 from public.consumption c join public.lot l on l.id=c.input_lot_id where c.output_lot_id=destination.id and l.type='whey' and l.id<>source.id) then raise exception 'Multi-lot disabled'; end if;
 if public.lot_available(source.id)<NEW.quantity then raise exception 'Allocation exceeds available quantity'; end if;
 if exists(select 1 from public.genealogy(destination.id,'forward') g where g.id=source.id) then raise exception 'Genealogy cycle'; end if;
 return NEW;
end $$;
create trigger check_consumption before insert on public.consumption for each row execute function private.check_consumption();

create function private.hold_critical() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if NEW.severity='critical' and NEW.closed_at is null then
 perform set_config('wise.transition','authorized',true);
 update public.lot set state='on_hold' where id=NEW.lot_id and state not in ('rejected','recalled','withdrawn','closed');
 insert into public.notification(cooperative_id,kind,payload) values(NEW.cooperative_id,'critical_deviation',jsonb_build_object('lot_id',NEW.lot_id,'deviation_id',NEW.id));
 end if; return NEW; end $$;
create trigger hold_critical after insert on public.deviation for each row execute function private.hold_critical();

-- Default EXECUTE grants are removed; explicitly expose authenticated read APIs only.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.lot_available(uuid),public.genealogy(uuid,text) to authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
