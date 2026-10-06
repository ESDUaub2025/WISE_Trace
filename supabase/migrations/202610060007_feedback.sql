create table public.complaint(id uuid primary key default gen_random_uuid(),cooperative_id uuid not null references public.cooperative,lot_id uuid not null references public.lot,message text not null check(length(message) between 5 and 2000),created_at timestamptz not null default now(),deviation_id uuid references public.deviation);
alter table public.complaint enable row level security;
revoke all on public.complaint from anon,authenticated;
grant select on public.complaint to authenticated;
create policy complaint_read on public.complaint for select to authenticated using(private.can_read(cooperative_id));
create trigger audit after insert or update on public.complaint for each row execute function private.audit_row();
create function public.report_problem(token text,message text) returns void language plpgsql security definer set search_path='' as $$
declare l public.lot; begin
 if length(message)<5 or length(message)>2000 then raise exception 'Message length invalid'; end if;
 select lot.* into l from public.lot join public.packaging_detail p on p.lot_id=lot.id where p.public_token=token and lot.state in ('released','recalled','withdrawn');
 if l.id is null then return; end if;
 if (select count(*) from public.complaint where lot_id=l.id and created_at>now()-interval '1 hour')>=20 then raise exception 'Please try later'; end if;
 insert into public.complaint(cooperative_id,lot_id,message) values(l.cooperative_id,l.id,message);
 insert into public.notification(cooperative_id,kind,payload) values(l.cooperative_id,'complaint',jsonb_build_object('lot_id',l.id));
end $$;
grant execute on function public.report_problem(text,text) to anon,authenticated;
