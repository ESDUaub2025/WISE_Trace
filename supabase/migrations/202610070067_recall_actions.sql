-- Append actions while the case remains open; closure preserves recall status.
create function public.record_recall_action(target uuid,action text,quantity numeric,notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.recall; result uuid:=gen_random_uuid(); begin
 select * into r from public.recall where id=target for update;
 if r.id is null or not private.can_operate(r.cooperative_id,array['supervisor','manager','admin','food_safety']) then raise exception 'Recall permission required'; end if;
 if r.status='closed' then raise exception 'Recall case is closed'; end if;
 if action not in ('stop_sale','notify','retrieve','destroy') or quantity is null or quantity<0 or length(trim(notes))<3 then raise exception 'Action, nonnegative quantity and notes required'; end if;
 insert into public.recall_action values(result,target,r.cooperative_id,action,quantity,notes,auth.uid(),now());return result;
end $$;
revoke all on function public.record_recall_action(uuid,text,numeric,text) from public,anon;
grant execute on function public.record_recall_action(uuid,text,numeric,text) to authenticated;
create or replace function public.complete_recall(target uuid,actions jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.recall; item jsonb; begin
 select * into r from public.recall where id=target for update;
 if r.id is null or not private.can_operate(r.cooperative_id,array['supervisor','manager','admin','food_safety']) then raise exception 'Recall permission required'; end if;
 if r.status='closed' then raise exception 'Recall case is closed'; end if;
 for item in select value from jsonb_array_elements(actions) loop
  perform public.record_recall_action(target,item->>'action',coalesce((item->>'quantity')::numeric,0),item->>'notes');
 end loop;
 if not exists(select 1 from public.recall_action where recall_id=target and action='stop_sale') then raise exception 'Confirm stop-sale action before closing'; end if;
 update public.recall set status='closed',completed_at=now() where id=target;
end $$;
