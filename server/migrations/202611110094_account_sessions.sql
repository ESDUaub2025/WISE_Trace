-- Sign-in rebuilt (docs/AUTH.md). Passwords, authenticator secrets and device sessions now live in
-- four small tables owned by this project. Roles, cooperatives and PINs are unchanged.
--
-- The tables of the previous sign-in library are removed. Their password hashes cannot be carried over,
-- so after this migration every account needs a password from an operator:
--   node server/cli/account.mjs set-password <username>

drop table if exists wise_auth."twoFactor", wise_auth."rateLimit", wise_auth.verification, wise_auth.session,
  wise_auth.account, wise_auth.mfa_session, wise_auth."user" cascade;

-- One row per account that can sign in.
create table wise_auth.credential(
  user_id uuid primary key references wise_auth.users(id) on delete cascade,
  password_hash text not null,                 -- scrypt$logN$r$p$salt$hash (server/auth/passwords.mjs)
  password_changed_at timestamptz not null default now(),
  failed_attempts integer not null default 0,  -- wrong passwords or codes since the last success
  blocked_until timestamptz,                   -- set when failed_attempts reaches the policy limit
  totp_secret text,                            -- sealed with AUTH_SECRET (server/auth/totp.mjs)
  totp_confirmed_at timestamptz,               -- null until the first code is accepted
  totp_last_step bigint                        -- last accepted time step; a code works once
);

-- One row per browser. The cookie holds a random value; only its SHA-256 hash is stored.
create table wise_auth.device_session(
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One row per person signed in on a browser. Several people can share one phone.
create table wise_auth.device_login(
  device_session_id uuid not null references wise_auth.device_session(id) on delete cascade,
  user_id uuid not null references wise_auth.users(id) on delete cascade,
  signed_in_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  second_factor_at timestamptz,                -- set when an authenticator code was accepted for this sign-in
  primary key(device_session_id, user_id)
);
create index device_login_user on wise_auth.device_login(user_id);

-- Single-use links sent by email.
create table wise_auth.email_token(
  token_hash text primary key,
  user_id uuid not null references wise_auth.users(id) on delete cascade,
  purpose text not null check(purpose in ('verify_email', 'reset_password')),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Only the API's own database login reads these tables; app users never do.
revoke all on wise_auth.credential, wise_auth.device_session, wise_auth.device_login, wise_auth.email_token
  from public, anon, authenticated;
grant select, insert, update, delete on wise_auth.credential, wise_auth.device_session, wise_auth.device_login,
  wise_auth.email_token to service_role;

-- An administrator or manager gives a member a new PIN (the member forgot it, or the phone was shared too freely).
-- Called only by the API after it has checked who is asking (server/functions/user-admin).
create function public.reset_member_pin(target uuid, pin text, actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare member public.membership;
begin
  if wise_auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service role only'; end if;
  if pin !~ '^[0-9]{4,6}$' then raise exception 'Invalid PIN'; end if;
  select * into member from public.membership where user_id = target;
  if member.user_id is null then raise exception 'Account unavailable'; end if;
  insert into private.user_pin(user_id, pin_hash) values(target, extensions.crypt(pin, extensions.gen_salt('bf', 12)))
    on conflict(user_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, blocked_until = null;
  insert into public.audit_event(cooperative_id, object_type, object_id, field, user_id, reason)
    values(member.cooperative_id, 'membership', target::text, 'pin_reset', actor, 'Access reset by an administrator');
end $$;
revoke all on function public.reset_member_pin(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reset_member_pin(uuid, text, uuid) to service_role;
grant select, insert, update, delete on wise_auth.users to service_role;

-- The API's database login is subject to row-level security, so it cannot read memberships directly.
-- These two narrow lookups are all the sign-in service needs from the business data.
create function wise_auth.account_for_username(wanted text) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.membership where username = wanted
$$;

-- allowed: the account exists and is not disabled. roles: decide whether a second factor is required.
create function wise_auth.standing(person uuid) returns table(allowed boolean, roles text[])
language sql stable security definer set search_path = '' as $$
  select exists(select from wise_auth.users where id = person and deleted_at is null)
           and not exists(select from public.membership where user_id = person and status = 'disabled'),
         coalesce((select m.roles from public.membership m where m.user_id = person), '{}')
$$;
revoke all on function wise_auth.account_for_username(text), wise_auth.standing(uuid) from public, anon, authenticated;
grant execute on function wise_auth.account_for_username(text), wise_auth.standing(uuid) to service_role;
