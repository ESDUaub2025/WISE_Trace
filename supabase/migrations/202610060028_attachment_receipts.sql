create or replace function public.register_attachment(target uuid,record uuid,path text,media_type text) returns void language plpgsql security definer set search_path='' as $$
declare receipt public.sync_receipt; existing public.attachment;
begin
 select * into receipt from public.sync_receipt where id=record and author_id=auth.uid() and status='synced';
 if receipt.id is null or not private.can_read(receipt.cooperative_id) or split_part(path,'/',1)<>receipt.cooperative_id::text or split_part(split_part(path,'/',2),'.',1)<>target::text then raise exception 'Attachment scope invalid'; end if;
 if not exists(select 1 from storage.objects where bucket_id='evidence' and name=path) then raise exception 'Attachment upload not confirmed'; end if;
 select * into existing from public.attachment where id=target;
 if existing.id is not null then
 if existing.record_id<>record or existing.author_id<>auth.uid() or existing.storage_path<>path then raise exception 'Attachment idempotency mismatch'; end if;
 return;
 end if;
 insert into public.attachment(id,cooperative_id,record_id,author_id,storage_path,media_type) values(target,receipt.cooperative_id,record,auth.uid(),path,media_type);
end $$;
