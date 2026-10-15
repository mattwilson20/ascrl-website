create function rc_private.validate_rules(c jsonb) returns void language plpgsql set search_path='' as $$
declare v jsonb; k text;
begin
 if jsonb_typeof(c)<>'object' or not(c ?& array['finish','stage','bonus','dq','defaultPoints','classification','teamCount','eligibility','minimumLaps']) then raise exception 'Incomplete scoring configuration'; end if;
 foreach k in array array['finish','stage'] loop
  if jsonb_typeof(c->k)<>'array' or jsonb_array_length(c->k)>500 or (k='finish' and jsonb_array_length(c->k)=0) then raise exception 'Invalid points table'; end if;
  for v in select value from jsonb_array_elements(c->k) loop
   if jsonb_typeof(v)<>'number' or (v::text)::numeric not between 0 and 10000 then raise exception 'Points must be between 0 and 10000'; end if;
  end loop;
 end loop;
 if jsonb_typeof(c->'bonus')<>'object' or not(c->'bonus' ?& array['pole','lapLed','mostLapsLed','fastestLap']) then raise exception 'Incomplete bonus settings'; end if;
 foreach k in array array['pole','lapLed','mostLapsLed','fastestLap'] loop
  if jsonb_typeof(c->'bonus'->k)<>'number' or (c->'bonus'->>k)::numeric not between 0 and 10000 then raise exception 'Invalid bonus'; end if;
 end loop;
 foreach k in array array['dq','defaultPoints','teamCount','minimumLaps'] loop
  if jsonb_typeof(c->k)<>'number' or (c->>k)::numeric not between 0 and 10000 or (c->>k)::numeric<>trunc((c->>k)::numeric) then raise exception 'Invalid integer rule value'; end if;
 end loop;
 if c->>'classification' not in ('overall','class') or c->>'eligibility' not in ('all','registered') then raise exception 'Invalid classification or eligibility mode'; end if;
end $$;

create function public.rc_manage(command text,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare l uuid; entity uuid; s public.rc_seasons; tm public.rc_teams; drv uuid; old public.rc_memberships; roster public.rc_team_memberships;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if command='create_league' then
  insert into public.rc_leagues(name,slug,description,is_public) values(p->>'name',p->>'slug',coalesce(p->>'description',''),coalesce((p->>'is_public')::boolean,true)) returning id into entity;
  insert into public.rc_memberships values(entity,auth.uid(),'commissioner','active');
  l:=entity;
 elsif command='join_league' then
  l:=(p->>'league_id')::uuid;
  if not exists(select 1 from public.rc_leagues where id=l and is_public) then raise exception 'League not open for registration'; end if;
  insert into public.rc_memberships values(l,auth.uid(),'driver','pending') on conflict(league_id,user_id) do nothing;
  entity:=l;
 elsif command='profile' then
  insert into public.rc_profiles(id,display_name) values(auth.uid(),p->>'display_name') on conflict(id) do update set display_name=excluded.display_name;
  update public.rc_drivers set racing_name=p->>'display_name' where id in (select driver_id from public.rc_driver_identities where account_id=auth.uid());
  return auth.uid();
 elsif command='link_identity' then
  if not public.rc_is_owner() then raise exception 'Only the platform owner can verify account ownership' using errcode='42501'; end if;
  entity:=(p->>'driver_id')::uuid;
  update public.rc_driver_identities set account_id=(p->>'account_id')::uuid where driver_id=entity;
  if not found then raise exception 'Driver not found'; end if;
  perform rc_private.audit(null,command,entity,jsonb_build_object('account_id',p->>'account_id'));
  return entity;
 else
  l:=(p->>'league_id')::uuid;
  if command='register' and public.rc_owns_driver((p->>'driver_id')::uuid) then
   perform rc_private.require_role(l,array['driver','team_owner','steward','commissioner']);
   insert into public.rc_registrations(season_id,league_id,driver_id) values((p->>'season_id')::uuid,l,(p->>'driver_id')::uuid) on conflict do nothing;
   entity:=(p->>'driver_id')::uuid;
  elsif command='roster' then
   select * into strict tm from public.rc_teams where id=(p->>'team_id')::uuid and league_id=l;
   if not public.rc_has_role(l,array['commissioner']) and not(tm.owner_id=auth.uid() and public.rc_has_role(l,array['team_owner'])) then raise exception 'Not authorized to manage this team' using errcode='42501'; end if;
   drv:=(p->>'driver_id')::uuid;
   perform pg_advisory_xact_lock(hashtextextended(l::text||drv::text,0));
   if exists(select 1 from public.rc_team_memberships where league_id=l and driver_id=drv and tstzrange(valid_from,valid_until,'[)') && tstzrange((p->>'valid_from')::timestamptz,nullif(p->>'valid_until','')::timestamptz,'[)')) then raise exception 'Overlapping team membership. End the previous membership first.'; end if;
   insert into public.rc_team_memberships(league_id,team_id,driver_id,valid_from,valid_until) values(l,tm.id,drv,(p->>'valid_from')::timestamptz,nullif(p->>'valid_until','')::timestamptz) returning id into entity;
  else
   perform rc_private.require_role(l,array['commissioner']);
   if command='create_series' then
    insert into public.rc_series(league_id,name) values(l,p->>'name') returning id into entity;
   elsif command='create_season' then
    if not (coalesce(p->'tiebreakers','["wins","top5","top10","average_finish","latest_finish"]') <@ '["wins","top5","top10","average_finish","latest_finish"]'::jsonb) then raise exception 'Unsupported tiebreaker'; end if;
    insert into public.rc_seasons(league_id,series_id,name,drop_weeks,tiebreakers) values(l,(p->>'series_id')::uuid,p->>'name',coalesce((p->>'drop_weeks')::int,0),array(select jsonb_array_elements_text(coalesce(p->'tiebreakers','["wins","top5","top10","average_finish","latest_finish"]')))) returning id into entity;
   elsif command='save_rules' then
    select * into strict s from public.rc_seasons where id=(p->>'season_id')::uuid and league_id=l for update;
    if s.status='archived' then raise exception 'Season is archived'; end if;
    perform rc_private.validate_rules(p->'config');
    insert into public.rc_scoring_rules(league_id,season_id,version,name,config,created_by) values(l,s.id,(select coalesce(max(version),0)+1 from public.rc_scoring_rules where season_id=s.id),p->>'name',p->'config',auth.uid()) returning id into entity;
    update public.rc_seasons set active_rule_id=entity where id=s.id;
   elsif command='create_race' then
    select * into strict s from public.rc_seasons where id=(p->>'season_id')::uuid and league_id=l;
    if s.status='archived' then raise exception 'Season is archived'; end if;
    insert into public.rc_races(league_id,season_id,name,track,starts_at,stage_count) values(l,s.id,p->>'name',p->>'track',(p->>'starts_at')::timestamptz,coalesce((p->>'stage_count')::int,0)) returning id into entity;
   elsif command='create_driver' then
    insert into public.rc_drivers(racing_name,car_number) values(p->>'racing_name',p->>'car_number') returning id into entity;
    insert into public.rc_driver_identities(driver_id,customer_id) values(entity,(p->>'customer_id')::bigint);
   elsif command='create_team' then
    if nullif(p->>'owner_id','') is not null and not exists(select 1 from public.rc_memberships where league_id=l and user_id=(p->>'owner_id')::uuid and status='active' and role in ('team_owner','commissioner')) then raise exception 'Owner needs an active team owner or commissioner membership'; end if;
    insert into public.rc_teams(league_id,name,owner_id) values(l,p->>'name',nullif(p->>'owner_id','')::uuid) returning id into entity;
   elsif command='end_roster' then
    entity:=(p->>'id')::uuid;
    select * into strict roster from public.rc_team_memberships where id=entity and league_id=l;
    perform pg_advisory_xact_lock(hashtextextended(l::text||roster.driver_id::text,0));
    if exists(select 1 from public.rc_team_memberships where league_id=l and driver_id=roster.driver_id and id<>entity
      and tstzrange(valid_from,valid_until,'[)') && tstzrange(roster.valid_from,(p->>'valid_until')::timestamptz,'[)')) then
     raise exception 'The new end time overlaps another team membership';
    end if;
    update public.rc_team_memberships set valid_until=(p->>'valid_until')::timestamptz where id=entity and league_id=l;
    if not found then raise exception 'Membership not found'; end if;
   elsif command='registration' then
    insert into public.rc_registrations(season_id,league_id,driver_id,eligible) values((p->>'season_id')::uuid,l,(p->>'driver_id')::uuid,(p->>'eligible')::boolean) on conflict(season_id,driver_id) do update set eligible=excluded.eligible;
    entity:=(p->>'driver_id')::uuid;
   elsif command='membership' then
    entity:=(p->>'user_id')::uuid;
    perform pg_advisory_xact_lock(hashtextextended(l::text,1));
    select * into old from public.rc_memberships where league_id=l and user_id=entity;
    if old.role='commissioner' and old.status='active' and (p->>'role'<>'commissioner' or p->>'status'<>'active') and not exists(select 1 from public.rc_memberships where league_id=l and role='commissioner' and status='active' and user_id<>entity) then raise exception 'The league must retain a commissioner'; end if;
    insert into public.rc_memberships values(l,entity,p->>'role',p->>'status') on conflict(league_id,user_id) do update set role=excluded.role,status=excluded.status;
   elsif command='archive_season' then
    entity:=(p->>'season_id')::uuid;
    update public.rc_seasons set status='archived' where id=entity and league_id=l;
    if not found then raise exception 'Season not found'; end if;
   else raise exception 'Unknown management command'; end if;
  end if;
 end if;
 perform rc_private.audit(l,command,entity,p);
 return entity;
end $$;

create function public.rc_my_driver() returns uuid language sql stable security definer set search_path='' as $$
 select driver_id from public.rc_driver_identities where account_id=auth.uid();
$$;
-- Account linkage is never included in commissioner matching queries or public responses.
revoke select on public.rc_driver_identities from anon,authenticated;
grant select(driver_id,customer_id) on public.rc_driver_identities to authenticated;
