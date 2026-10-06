-- PostgreSQL schema-specific default revokes do not override the global PUBLIC
-- EXECUTE default. Revoke globally and retain only explicit role grants.
alter default privileges revoke execute on functions from public;
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema private from public;
