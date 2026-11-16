-- Standard PostgreSQL only. These roles are application roles, never login users.
create schema if not exists extensions;
create schema if not exists wise_auth;
create schema if not exists wise_storage;
do $$ begin
 if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public,extensions,wise_auth,wise_storage to anon,authenticated,service_role;
create table if not exists wise_auth.users(
 id uuid primary key, email text unique not null, email_confirmed_at timestamptz,
 deleted_at timestamptz, raw_user_meta_data jsonb not null default '{}',
 raw_app_meta_data jsonb not null default '{}', created_at timestamptz not null default now()
);
create or replace function wise_auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create or replace function wise_auth.uid() returns uuid language sql stable as $$
 select nullif(wise_auth.jwt()->>'sub','')::uuid
$$;
grant execute on function wise_auth.jwt(),wise_auth.uid() to anon,authenticated,service_role;
create table if not exists wise_storage.buckets(
 id text primary key,name text not null,public boolean not null default false,
 file_size_limit bigint not null,allowed_mime_types text[] not null
);
create table if not exists wise_storage.objects(
 id uuid primary key default gen_random_uuid(),bucket_id text not null references wise_storage.buckets,
 name text not null,metadata jsonb not null default '{}',created_at timestamptz not null default now(),
 unique(bucket_id,name)
);
alter table wise_storage.objects enable row level security;
grant select,insert on wise_storage.objects to authenticated;
grant select on wise_storage.buckets to authenticated;
create or replace function wise_storage.foldername(name text) returns text[] language sql immutable as $$
 select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
$$;
grant execute on function wise_storage.foldername(text) to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
