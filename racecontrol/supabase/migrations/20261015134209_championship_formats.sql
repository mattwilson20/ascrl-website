-- League-owned written rules and a versioned driver-championship format.
alter table public.rc_leagues add column rulebook text not null default '' check(char_length(rulebook)<=50000),
 add column rulebook_version integer not null default 0;
alter table public.rc_seasons add column championship_config jsonb not null default '{"mode":"full_season"}',
 add column championship_version integer not null default 0;
-- Keep the calendar order independent of the export's actual session start time.
alter table public.rc_races add column scheduled_at timestamptz;
update public.rc_races set scheduled_at=starts_at;
alter table public.rc_races alter column scheduled_at set not null;

create function rc_private.championship_valid(c jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare r jsonb; v jsonb; k text; n numeric; previous_size integer:=501; i integer:=0; total integer;
begin
 if jsonb_typeof(c) is distinct from 'object' then raise exception 'Invalid championship configuration'; end if;
 if c->>'mode'='full_season' and c='{"mode":"full_season"}'::jsonb then return true; end if;
 if c->>'mode' is null or c->>'mode' not in ('chase','playoffs') or
  not(c ?& array['mode','regularSeasonRaces','qualification','minimumStarts','seedBonuses','raceWinBonus','stageWinBonus','rounds']) or
  (select count(*) from jsonb_object_keys(c))<>8 then raise exception 'Incomplete championship configuration'; end if;
 foreach k in array array['regularSeasonRaces','minimumStarts','raceWinBonus','stageWinBonus'] loop
  if jsonb_typeof(c->k) is distinct from 'number' then raise exception 'Invalid championship number'; end if;
  n:=(c->>k)::numeric;
  if n<0 or n>100000 or n<>round(n,3) then raise exception 'Invalid championship number'; end if;
  if k in ('regularSeasonRaces','minimumStarts') and (n<>trunc(n) or n>200) then raise exception 'Invalid race count'; end if;
 end loop;
 if (c->>'regularSeasonRaces')::int<1 or (c->>'minimumStarts')::int>(c->>'regularSeasonRaces')::int then raise exception 'Invalid minimum starts'; end if;
 if c->>'qualification' is null or c->>'qualification' not in ('points','wins_then_points') then raise exception 'Invalid qualification method'; end if;
 if jsonb_typeof(c->'seedBonuses') is distinct from 'array' or jsonb_typeof(c->'rounds') is distinct from 'array' then raise exception 'Invalid championship lists'; end if;
 if jsonb_array_length(c->'seedBonuses')>500 or jsonb_array_length(c->'rounds') not between 1 and 10 then raise exception 'Invalid championship list length'; end if;
 if c->>'mode'='chase' and jsonb_array_length(c->'rounds')<>1 then raise exception 'A Chase has one round'; end if;
 for v in select value from jsonb_array_elements(c->'seedBonuses') loop
  if jsonb_typeof(v) is distinct from 'number' then raise exception 'Invalid seed bonus'; end if;
  n:=v::text::numeric;
  if n<0 or n>100000 or n<>round(n,3) then raise exception 'Invalid seed bonus'; end if;
 end loop;
 total:=(c->>'regularSeasonRaces')::int;
 for r in select value from jsonb_array_elements(c->'rounds') loop
  i:=i+1;
  if jsonb_typeof(r) is distinct from 'object' then raise exception 'Invalid round'; end if;
  if not(r ?& array['name','races','fieldSize','resetPoints','addBonuses','winAdvance','scoring']) or
   (select count(*) from jsonb_object_keys(r))<>7 then raise exception 'Incomplete round'; end if;
  if jsonb_typeof(r->'name') is distinct from 'string' or char_length(btrim(r->>'name')) not between 1 and 80 then raise exception 'Invalid round name'; end if;
  foreach k in array array['races','fieldSize'] loop
   if jsonb_typeof(r->k) is distinct from 'number' then raise exception 'Invalid round count'; end if;
   n:=(r->>k)::numeric;
   if n<>trunc(n) or (k='races' and n not between 1 and 100) or (k='fieldSize' and n not between 2 and 500) then raise exception 'Invalid round count'; end if;
  end loop;
  if (r->>'fieldSize')::int>=previous_size then raise exception 'Each playoff round must have a smaller field'; end if;
  previous_size:=(r->>'fieldSize')::int;
  total:=total+(r->>'races')::int;
  if jsonb_typeof(r->'addBonuses') is distinct from 'boolean' or jsonb_typeof(r->'winAdvance') is distinct from 'boolean' then raise exception 'Invalid round option'; end if;
  if jsonb_typeof(r->'resetPoints')='null' then
   if (r->>'addBonuses')::boolean then raise exception 'Bonuses require a points reset'; end if;
  else
   if jsonb_typeof(r->'resetPoints') is distinct from 'number' then raise exception 'Invalid reset points'; end if;
   n:=(r->>'resetPoints')::numeric;
   if n<0 or n>100000 or n<>round(n,3) then raise exception 'Invalid reset points'; end if;
  end if;
  if r->>'scoring' is null or r->>'scoring' not in ('points','finish') then raise exception 'Invalid round scoring'; end if;
  if r->>'scoring'='finish' and (i<>jsonb_array_length(c->'rounds') or (r->>'races')::int<>1) then raise exception 'Finish-order scoring requires a one-race final'; end if;
  if i=jsonb_array_length(c->'rounds') and (r->>'winAdvance')::boolean then raise exception 'The final cannot advance to another round'; end if;
 end loop;
 if total>500 then raise exception 'Championship exceeds 500 races'; end if;
 return true;
end $$;
alter table public.rc_seasons add constraint rc_championship_valid check(rc_private.championship_valid(championship_config));

create function public.rc_settings(command text,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare l uuid:=(p->>'league_id')::uuid; s public.rc_seasons; league public.rc_leagues; cfg jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform rc_private.require_role(l,array['commissioner']);
 if command='league_settings' then
  select * into strict league from public.rc_leagues where id=l for update;
  if (p->>'version')::int is distinct from league.rulebook_version then raise exception 'League settings changed. Reload before saving.'; end if;
  if jsonb_typeof(p->'rulebook') is distinct from 'string' or char_length(p->>'rulebook')>50000 then raise exception 'Rulebook must be text of at most 50000 characters'; end if;
  update public.rc_leagues set name=btrim(p->>'name'),description=p->>'description',rulebook=p->>'rulebook',rulebook_version=rulebook_version+1 where id=l;
  perform rc_private.audit(l,command,l,jsonb_build_object('version',league.rulebook_version+1,'previous_name',league.name,'previous_description',league.description,'previous_rulebook',league.rulebook,'name',p->>'name','description',p->>'description','rulebook',p->>'rulebook'));
  return l;
 elsif command='championship_settings' then
  select * into strict s from public.rc_seasons where id=(p->>'season_id')::uuid and league_id=l for update;
  if s.status='archived' or exists(select 1 from public.rc_races where season_id=s.id and status='published') then raise exception 'Championship settings lock after the first published race or archival'; end if;
  if (p->>'version')::int is distinct from s.championship_version then raise exception 'Championship settings changed. Reload before saving.'; end if;
  cfg:=p->'config';
  perform rc_private.championship_valid(cfg);
  if jsonb_typeof(p->'tiebreakers') is distinct from 'array' then raise exception 'Invalid tiebreakers'; end if;
  if not(p->'tiebreakers' <@ '["wins","top5","top10","average_finish","latest_finish"]'::jsonb) or jsonb_array_length(p->'tiebreakers')>5 then raise exception 'Invalid tiebreakers'; end if;
  if (select count(distinct v) from jsonb_array_elements_text(p->'tiebreakers') x(v))<>jsonb_array_length(p->'tiebreakers') then raise exception 'Tiebreakers cannot repeat'; end if;
  update public.rc_seasons set name=btrim(p->>'name'),drop_weeks=(p->>'drop_weeks')::int,
   tiebreakers=array(select jsonb_array_elements_text(p->'tiebreakers')),championship_config=cfg,championship_version=championship_version+1 where id=s.id;
  perform rc_private.audit(l,command,s.id,jsonb_build_object('version',s.championship_version+1,'previous',s.championship_config,'config',cfg,'name',p->>'name','drop_weeks',p->'drop_weeks','tiebreakers',p->'tiebreakers'));
  return s.id;
 else raise exception 'Unknown settings command'; end if;
end $$;
revoke all on function public.rc_settings(text,jsonb) from public,anon;
grant execute on function public.rc_settings(text,jsonb) to authenticated;

-- Serialize settings with publication; keep postseason cut lines tied to a fixed calendar.
create function rc_private.championship_calendar_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.rc_seasons; sid uuid; total integer; required integer; has_results boolean;
begin
 sid:=case when tg_op='DELETE' then old.season_id else new.season_id end;
 if tg_op='INSERT' then new.scheduled_at:=new.starts_at; end if;
 select * into strict s from public.rc_seasons where id=sid for update;
 if s.championship_config->>'mode'='full_season' then return case when tg_op='DELETE' then old else new end; end if;
 select exists(select 1 from public.rc_races where season_id=s.id and status='published') into has_results;
 if tg_op='INSERT' or tg_op='DELETE' then
  if has_results then raise exception 'The championship calendar locks after the first published race'; end if;
 elsif has_results and (new.scheduled_at is distinct from old.scheduled_at or new.season_id is distinct from old.season_id or new.status<>old.status and new.status<>'published') then
  raise exception 'The championship calendar locks after the first published race';
 end if;
 if tg_op='UPDATE' and new.status='published' and old.status<>'published' then
  select count(*) into total from public.rc_races where season_id=s.id;
  select (s.championship_config->>'regularSeasonRaces')::int+sum((r->>'races')::int) into required from jsonb_array_elements(s.championship_config->'rounds') x(r);
  if total<>required then raise exception 'Complete the championship calendar before publishing: expected % races, found %',required,total; end if;
  if exists(select 1 from public.rc_races where season_id=s.id and id<>new.id and (scheduled_at,id)<(new.scheduled_at,new.id) and status<>'published') then raise exception 'Publish championship races in calendar order'; end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger rc_championship_calendar before insert or update or delete on public.rc_races for each row execute function rc_private.championship_calendar_guard();

-- A single stable statement sees a consistent revision of races, stages and scores.
-- SECURITY INVOKER preserves league visibility; no original imports or identity data.
create function public.rc_championship_snapshot(season uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'season',jsonb_build_object('championship_config',s.championship_config,'drop_weeks',s.drop_weeks,'tiebreakers',s.tiebreakers),
  'races',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'starts_at',r.scheduled_at,'status',r.status,'revision',r.revision) order by r.scheduled_at,r.id) from public.rc_races r where r.season_id=s.id),'[]'),
  'scores',coalesce((select jsonb_agg(jsonb_build_object('race_id',sc.race_id,'driver_id',sc.driver_id,'position',sc.position,'dq',sc.dq,'eligible',sc.eligible,'finish_points',sc.finish_points,'stage_points',sc.stage_points,'bonus_points',sc.bonus_points,'penalty_points',sc.penalty_points)) from public.rc_scores sc where sc.season_id=s.id),'[]'),
  'stages',coalesce((select jsonb_agg(jsonb_build_object('race_id',st.race_id,'driver_id',st.driver_id,'revision',st.revision,'position',st.position)) from public.rc_stages st join public.rc_races r on r.id=st.race_id and r.revision=st.revision where r.season_id=s.id and st.position=1),'[]'),
  'standings',coalesce((select jsonb_agg(to_jsonb(d) order by d.championship_position) from public.rc_driver_standings d where d.season_id=s.id),'[]'))
 from public.rc_seasons s where s.id=season;
$$;
revoke all on function public.rc_championship_snapshot(uuid) from public;
grant execute on function public.rc_championship_snapshot(uuid) to anon,authenticated;
revoke all on function rc_private.championship_valid(jsonb),rc_private.championship_calendar_guard() from public,anon,authenticated;
