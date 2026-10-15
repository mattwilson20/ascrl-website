-- Acceptance checks for the explicitly private commissioning fixture.
-- Run as the database administrator. All mutations are rolled back.
begin;
do $$
declare s uuid; l uuid; actor uuid;
begin
  select se.id, le.id into strict s,l
  from public.rc_seasons se join public.rc_leagues le on le.id=se.league_id
  where le.slug='setup-verification-20261015' and not le.is_public
    and se.name='Commissioning check — not official';
  select user_id into strict actor from public.rc_memberships
  where league_id=l and role='commissioner' and status='active';
  perform set_config('ascrl.check_season',s::text,true);
  perform set_config('ascrl.check_league',l::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;

set local role authenticated;
do $$
declare s uuid:=current_setting('ascrl.check_season')::uuid;
  r uuid; j uuid; d uuid; penalty uuid; pts numeric;
begin
  select id into strict r from public.rc_races where season_id=s and status='published';
  select id into strict j from public.rc_imports where race_id=r and status='committed';
  if (select count(*) from public.rc_scores where race_id=r)<>21 then raise exception 'Expected 21 scores'; end if;
  if exists(select 1 from public.rc_imports where id=j and payload is not null) then raise exception 'Preview payload retained'; end if;
  perform public.rc_publish_import(j,'{}'::bigint[],'[]'::jsonb,true);
  if exists(select 1 from public.rc_driver_standings where season_id=s and starts<>1)
    or (select count(*) from public.rc_scores where race_id=r)<>21 then raise exception 'Publication retry duplicated scores'; end if;
  select driver_id,total_points into strict d,pts from public.rc_scores where race_id=r and position=1;
  if pts<>40 then raise exception 'Expected 40 winner points'; end if;
  penalty:=public.rc_penalty(jsonb_build_object('race_id',r,'driver_id',d,'type','points','value',10,'reason','Transactional setup check only'));
  if (select total_points from public.rc_scores where race_id=r and driver_id=d)<>40 then raise exception 'Pending penalty changed points'; end if;
  perform public.rc_penalty(jsonb_build_object('id',penalty,'status','active','reason','Verify a ten-point deduction'));
  perform public.rc_penalty(jsonb_build_object('id',penalty,'status','active','reason','Verify repeated confirmation is idempotent'));
  if (select total_points from public.rc_scores where race_id=r and driver_id=d)<>30 then raise exception 'Penalty applied incorrectly'; end if;
  perform public.rc_penalty(jsonb_build_object('id',penalty,'status','overturned','reason','Reverse the temporary verification deduction'));
  if (select total_points from public.rc_scores where race_id=r and driver_id=d)<>40 then raise exception 'Penalty reversal did not restore points'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
begin
  if exists(select 1 from public.rc_leagues where id=current_setting('ascrl.check_league')::uuid)
    or exists(select 1 from public.rc_driver_standings where season_id=current_setting('ascrl.check_season')::uuid)
    or exists(select 1 from public.rc_imported_results where league_id=current_setting('ascrl.check_league')::uuid)
  then raise exception 'Private league data exposed anonymously'; end if;
  begin
    perform public.rc_manage('create_series',jsonb_build_object('league_id',current_setting('ascrl.check_league'),'name','Should never be created'));
    raise exception 'Anonymous management unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
-- A deliberately unregistered identity exercises the no-membership path.
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.rc_scores where season_id=current_setting('ascrl.check_season')::uuid)
  then raise exception 'Private results exposed to an unrelated identity'; end if;
  begin
    perform public.rc_manage('create_series',jsonb_build_object('league_id',current_setting('ascrl.check_league'),'name','Should never be created'));
    raise exception 'Cross-league management unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform account_id from public.rc_driver_identities;
    raise exception 'Private account linkage unexpectedly readable';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

select 'passed' as acceptance,
  '21-driver publication, retry idempotence, 40->30->40 penalty reversal, anonymous and unrelated-user isolation' as checks,
  'All test mutations rolled back; existing private sample publication retained' as retention;
