create function private.can_access_training_config(config uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(array['producer','supervisor','manager','admin','food_safety','partner']) and exists(select 1 from public.config_version cv where cv.id=config and (cv.status='approved' or private.has_role(array['admin','food_safety'])) and (cv.cooperative_id is null or private.can_read(cv.cooperative_id)));
$$;
revoke all on function private.can_access_training_config(uuid) from public,anon;
grant execute on function private.can_access_training_config(uuid) to authenticated;
create table public.training_asset(id uuid primary key,config_version_id uuid not null references public.config_version,cooperative_id uuid references public.cooperative,title jsonb not null,storage_path text not null unique,media_type text not null,byte_size bigint not null check(byte_size between 1 and 10485760),uploaded_by uuid not null references public.membership,recorded_at timestamptz not null default now());
alter table public.training_asset enable row level security;
revoke all on public.training_asset from public,anon,authenticated;
grant select on public.training_asset to authenticated;
create policy training_asset_read on public.training_asset for select to authenticated using(private.can_access_training_config(config_version_id));
create trigger immutable before update or delete on public.training_asset for each row execute function private.immutable();
create trigger audit after insert on public.training_asset for each row execute function private.audit_row();
insert into wise_storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('training','training',false,10485760,array['image/jpeg','image/png','image/webp','video/webm','video/mp4']) on conflict(id) do nothing;
create policy training_file_read on wise_storage.objects for select to authenticated using(bucket_id='training' and private.can_access_training_config((wise_storage.foldername(name))[1]::uuid));
create policy training_file_insert on wise_storage.objects for insert to authenticated with check(bucket_id='training' and private.has_role(array['admin']) and private.can_access_training_config((wise_storage.foldername(name))[1]::uuid));
create function public.register_training_asset(target uuid,config uuid,path text,title jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare object wise_storage.objects;scope uuid;asset public.training_asset;
begin
 if not private.has_role(array['admin']) or not private.can_access_training_config(config) or split_part(path,'/',1)<>config::text or split_part(split_part(path,'/',2),'.',1)<>target::text or length(title->>'en')<2 or length(title->>'ar')<2 then raise exception 'Training asset scope and bilingual title required';end if;
 select * into object from wise_storage.objects where bucket_id='training' and name=path;
 if object.id is null then raise exception 'Training upload not confirmed';end if;
 select cooperative_id into scope from public.config_version where id=config;
 select * into asset from public.training_asset where id=target;
 if asset.id is not null then
 if asset.config_version_id<>config or asset.storage_path<>path or asset.uploaded_by<>wise_auth.uid() then raise exception 'Training asset idempotency mismatch';end if;return to_jsonb(asset);
 end if;
 insert into public.training_asset(id,config_version_id,cooperative_id,title,storage_path,media_type,byte_size,uploaded_by) values(target,config,scope,title,path,object.metadata->>'mimetype',(object.metadata->>'size')::bigint,wise_auth.uid()) returning * into asset;
 return to_jsonb(asset);
end $$;
revoke all on function public.register_training_asset(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.register_training_asset(uuid,uuid,text,jsonb) to authenticated;
drop policy training_read on public.training_module;
create policy training_read on public.training_module for select to authenticated using(private.can_access_training_config(config_version_id));
