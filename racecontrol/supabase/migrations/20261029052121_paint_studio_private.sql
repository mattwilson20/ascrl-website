-- Private pilot. There is deliberately no role-based, email-based or client-side bypass.
create schema if not exists rc_paint_private;
revoke all on schema rc_paint_private from public, anon, authenticated;

create table public.rc_paint_access (
  user_id uuid primary key references auth.users(id),
  enabled boolean not null default true,
  host_seen timestamptz,
  constraint paint_pilot_owner check (user_id='2a20a12e-3786-481d-a77d-72d281290948')
);
alter table public.rc_paint_access enable row level security;
grant select on public.rc_paint_access to authenticated;
create policy paint_access_self on public.rc_paint_access for select to authenticated
  using (user_id=(select auth.uid()));
insert into public.rc_paint_access(user_id)
  select id from auth.users where id='2a20a12e-3786-481d-a77d-72d281290948';

create table rc_paint_private.host_credentials (
  user_id uuid primary key references public.rc_paint_access(user_id),
  token_hash bytea not null check (octet_length(token_hash)=32),
  expires_at timestamptz not null
);
alter table rc_paint_private.host_credentials enable row level security;
revoke all on rc_paint_private.host_credentials from public,anon,authenticated;

create table public.rc_paint_sessions (
  user_id uuid primary key references public.rc_paint_access(user_id),
  id uuid not null unique,
  offer jsonb not null check (octet_length(offer::text)<65536 and offer->>'type'='offer'),
  answer jsonb check (answer is null or (octet_length(answer::text)<65536 and answer->>'type'='answer')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  client_seen timestamptz not null default now(),
  closed boolean not null default false,
  check (expires_at<=created_at+interval '2 hours')
);
alter table public.rc_paint_sessions enable row level security;
grant select,insert,update on public.rc_paint_sessions to authenticated;
create policy paint_sessions_self on public.rc_paint_sessions for all to authenticated
  using (user_id=(select auth.uid()) and exists(select 1 from public.rc_paint_access a where a.user_id=(select auth.uid()) and a.enabled))
  with check (user_id=(select auth.uid()) and exists(select 1 from public.rc_paint_access a where a.user_id=(select auth.uid()) and a.enabled));

-- Artwork only. No meshes, textures from the simulator, or model archives are stored here.
create table public.rc_paint_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.rc_paint_access(user_id),
  profile text not null check (profile in ('camaro','mustang','camry')),
  title text not null,
  content jsonb not null check (octet_length(content::text)<=52428800),
  content_hash bytea not null,
  created_at timestamptz not null default now(),
  unique(user_id,profile,content_hash)
);
alter table public.rc_paint_backups enable row level security;
grant select(id,user_id,profile,title,created_at) on public.rc_paint_backups to authenticated;
create policy paint_backups_self on public.rc_paint_backups for select to authenticated
  using (user_id=(select auth.uid()) and exists(select 1 from public.rc_paint_access a where a.user_id=(select auth.uid()) and a.enabled));

-- The PC has a random 256-bit scoped credential, stored with Windows DPAPI.
-- It can only signal this owner's session or save/restore this owner's artwork.
-- It cannot access league data, account data, other files, or change permissions.
create function public.rc_paint_host(p_token text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; s public.rc_paint_sessions; doc jsonb; result jsonb; hash bytea;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Host not authorized'; end if;
  select c.user_id into uid from rc_paint_private.host_credentials c
    join public.rc_paint_access a on a.user_id=c.user_id and a.enabled
    where c.token_hash=pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')) and c.expires_at>now();
  if uid is null then raise exception 'Host not authorized'; end if;
  if p_action='poll' then
    update public.rc_paint_access set host_seen=now() where user_id=uid;
    select * into s from public.rc_paint_sessions where user_id=uid and not closed
      and expires_at>now() and client_seen>now()-interval '45 seconds';
    if s.id is null then return jsonb_build_object('session',null); end if;
    return jsonb_build_object('session',jsonb_build_object('id',s.id,'offer',s.offer,'expires_at',s.expires_at));
  elsif p_action='answer' then
    update public.rc_paint_sessions set answer=p_payload->'answer'
      where user_id=uid and id=(p_payload->>'id')::uuid and not closed and expires_at>now();
    if not found then raise exception 'Session is closed'; end if;
    return '{"ok":true}'::jsonb;
  elsif p_action='backup' then
    doc=p_payload->'doc';
    if doc is null or doc->>'format' is distinct from 'garage-livery' or doc->>'version' is distinct from '2'
      or doc->>'profile' not in ('camaro','mustang','camry') or jsonb_typeof(doc->'layers') is distinct from 'array'
      or jsonb_typeof(doc->'assets') is distinct from 'object' or octet_length(doc::text)>52428800
      then raise exception 'Invalid artwork snapshot'; end if;
    hash=pg_catalog.sha256(pg_catalog.convert_to(doc::text,'UTF8'));
    select jsonb_build_object('id',id,'created_at',created_at) into result from public.rc_paint_backups
      where user_id=uid and profile=doc->>'profile' and content_hash=hash;
    if result is not null then return result; end if;
    perform pg_catalog.pg_advisory_xact_lock(709284019);
    if (select coalesce(sum(octet_length(content::text)),0) from public.rc_paint_backups where user_id=uid)+octet_length(doc::text)>524288000
      then raise exception 'Cloud artwork quota reached; local saves remain available'; end if;
    insert into public.rc_paint_backups(user_id,profile,title,content,content_hash)
      values(uid,doc->>'profile',left(coalesce(doc->>'title','Untitled'),160),doc,hash)
      returning jsonb_build_object('id',id,'created_at',created_at) into result;
    return result;
  elsif p_action='restore' then
    select content into doc from public.rc_paint_backups where user_id=uid and id=(p_payload->>'id')::uuid;
    if doc is null then raise exception 'Snapshot not found'; end if;
    return jsonb_build_object('doc',doc);
  else raise exception 'Unsupported host action'; end if;
end $$;
revoke all on function public.rc_paint_host(text,text,jsonb) from public;
grant execute on function public.rc_paint_host(text,text,jsonb) to anon,authenticated;
comment on function public.rc_paint_host(text,text,jsonb) is 'Narrow PC renderer RPC: requires a 256-bit host credential, checked against private hash and owner enable flag on every call. No league or auth access.';
