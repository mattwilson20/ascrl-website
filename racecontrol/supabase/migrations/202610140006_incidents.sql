create table public.rc_incidents (
 id uuid primary key default gen_random_uuid(), league_id uuid not null,
 race_id uuid not null, reporter_id uuid not null references auth.users(id),
 driver_id uuid not null references public.rc_drivers(id), lap integer check(lap between 0 and 100000),
 statement text not null check(length(statement) between 10 and 5000),
 evidence_url text check(evidence_url is null or (length(evidence_url)<=2000 and evidence_url ~ '^https://')),
 status text not null default 'open' check(status in ('open','reviewed','dismissed')),
 decision text check(decision is null or length(decision) between 10 and 5000),
 reviewed_by uuid references auth.users(id), created_at timestamptz not null default now(), reviewed_at timestamptz,
 foreign key(race_id,league_id) references public.rc_races(id,league_id)
);
create index rc_incidents_league on public.rc_incidents(league_id,status,created_at);
alter table public.rc_incidents enable row level security;
revoke all on public.rc_incidents from public,anon,authenticated;
grant select on public.rc_incidents to authenticated;
create policy incidents_read on public.rc_incidents for select to authenticated using(
 reporter_id=auth.uid() or public.rc_has_role(league_id,array['commissioner','steward']));

create function public.rc_incident(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rc_races; previous public.rc_incidents; entity uuid; own_driver uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p->>'id' is not null then
  select * into strict previous from public.rc_incidents where id=(p->>'id')::uuid for update;
  perform rc_private.require_role(previous.league_id,array['commissioner','steward']);
  if p->>'status' not in ('reviewed','dismissed') or length(trim(coalesce(p->>'decision','')))<10 then raise exception 'Record a review decision and rationale'; end if;
  update public.rc_incidents set status=p->>'status',decision=p->>'decision',reviewed_by=auth.uid(),reviewed_at=now() where id=previous.id;
  perform rc_private.audit(previous.league_id,'incident.reviewed',previous.id,jsonb_build_object('before',to_jsonb(previous),'decision',p));
  return previous.id;
 end if;
 select * into strict r from public.rc_races where id=(p->>'race_id')::uuid and status='published';
 own_driver:=public.rc_my_driver();
 if not public.rc_has_role(r.league_id,array['commissioner','steward']) then
  if not public.rc_can_read(r.league_id) or own_driver is null or not exists(select 1 from public.rc_scores where race_id=r.id and driver_id=own_driver) then
   raise exception 'Only participating verified drivers and authorized stewards can report this race' using errcode='42501';
  end if;
 end if;
 if (select count(*) from public.rc_incidents where reporter_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Incident report limit reached; please try again later'; end if;
 if not exists(select 1 from public.rc_scores where race_id=r.id and driver_id=(p->>'driver_id')::uuid) then raise exception 'Select a driver in this race'; end if;
 insert into public.rc_incidents(league_id,race_id,reporter_id,driver_id,lap,statement,evidence_url)
 values(r.league_id,r.id,auth.uid(),(p->>'driver_id')::uuid,(p->>'lap')::int,p->>'statement',nullif(p->>'evidence_url','')) returning id into entity;
 perform rc_private.audit(r.league_id,'incident.reported',entity,jsonb_build_object('race_id',r.id));
 return entity;
end $$;
revoke all on function public.rc_incident(jsonb) from public,anon,authenticated;
grant execute on function public.rc_incident(jsonb) to authenticated;
