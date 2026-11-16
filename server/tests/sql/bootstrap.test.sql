begin;
set local client_min_messages=warning;
set local search_path=public,extensions;
select no_plan();
create temporary table bootstrap_definition as select definition from public.config_version where id='40000000-0000-4000-8000-000000000001';
grant select on bootstrap_definition to service_role;
-- Isolated transaction: all existing fictional data is restored by the final rollback.
truncate public.cooperative cascade;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select public.bootstrap_installation('10000000-0000-4000-8000-000000000001','{"code":"BOOT1","name":"Bootstrap test cooperative","region":"Test"}','[{"id":"20000000-0000-4000-8000-000000000004","username":"admin1","display_name":"Test Admin","role":"admin","pin":"2468"},{"id":"20000000-0000-4000-8000-000000000005","username":"food_safety1","display_name":"Test Food-Safety Lead","role":"food_safety","pin":"2468"}]',(select definition from bootstrap_definition))$$,'Service role creates initial cooperative, separate owner accounts and configuration draft');
select is((select count(*)::integer from public.membership),2,'Bootstrap creates exactly two separate memberships');
select is((select status from public.config_version),'draft','Initial configuration is a draft');
select ok((select placeholder from public.config_version),'Bootstrap preserves the placeholder flag');
select is((select count(*)::integer from public.config_version where status='approved'),0,'Bootstrap never approves production safety rules');
select throws_ok($$select public.bootstrap_installation(gen_random_uuid(),'{}','[]','{}')$$,'P0001','Bootstrap requires an empty installation','Bootstrap cannot overwrite an existing installation');
reset role;
select * from finish();
rollback;
