create function public.provision_membership(target uuid,coop uuid,username text,display_name text,roles text[],authorizations jsonb,pin text,actor uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service role only'; end if;
 if pin !~ '^[0-9]{4,6}$' then raise exception 'Invalid PIN'; end if;
 insert into public.membership(user_id,cooperative_id,username,display_name,roles,authorizations) values(target,coop,username,display_name,roles,authorizations);
 insert into private.user_pin(user_id,pin_hash) values(target,extensions.crypt(pin,extensions.gen_salt('bf',12)));
 insert into public.audit_event(cooperative_id,object_type,object_id,field,new_value,user_id,reason) values(coop,'membership',target::text,'provisioned',jsonb_build_object('roles',roles),actor,'Admin user provisioning');
end $$;
grant execute on function public.provision_membership(uuid,uuid,text,text,text[],jsonb,text,uuid) to service_role;
