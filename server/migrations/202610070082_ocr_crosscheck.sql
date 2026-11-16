-- An online cross-check adds evidence; it never changes a measured value.
create function public.record_ocr_crosscheck(target uuid,reading jsonb,device uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.operational_record;result uuid:=gen_random_uuid();confidence numeric;begin
 select * into r from public.operational_record where id=target;
 if r.id is null or not private.can_operate(r.cooperative_id,array['producer','supervisor','food_safety','admin']) then raise exception 'Record unavailable';end if;
 if not exists(select 1 from public.device d where d.id=$3 and d.registered_by=wise_auth.uid() and d.revoked_at is null) then raise exception 'Registered device required';end if;
 if not exists(select 1 from public.attachment where record_id=target and media_type like 'image/%') then raise exception 'Original record photograph required';end if;
 confidence:=(reading->>'confidence')::numeric;
 if confidence is null or confidence<0 or confidence>1 or jsonb_typeof(reading->'value') not in ('number','string') or length(reading->>'value')>200 then raise exception 'Invalid OCR suggestion';end if;
 insert into public.operational_record(id,cooperative_id,lot_id,kind,config_version_id,payload,author_id,device_id,observed_at)
 values(result,r.cooperative_id,r.lot_id,'note',r.config_version_id,jsonb_build_object('ocr_crosscheck_of',target,'manual_value',r.payload->'value','suggestion',reading,'review_required',true),wise_auth.uid(),device,now());
 return result;
end $$;
revoke all on function public.record_ocr_crosscheck(uuid,jsonb,uuid) from public,anon;
grant execute on function public.record_ocr_crosscheck(uuid,jsonb,uuid) to authenticated;
