create function rc_private.recalculate(rid uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.rc_races; c jsonb; e record; finish numeric; stagepoints numeric; bonus numeric; deduction numeric;
        pos int; maxled int; fastest numeric; eligible boolean; grid uuid[]; adjustment record;
begin
 select * into strict r from public.rc_races where id=rid for update;
 if r.revision=0 then return; end if;
 select config into strict c from public.rc_scoring_rules where id=r.rule_id;
 delete from public.rc_scores where race_id=rid;
 -- Apply each driver's latest position decision as an actual move in the grid.
 -- Inserting before an unchanged numeric position would fail when moving down.
 select array_agg(driver_id order by (original->>'position')::int,driver_id) into grid
 from public.rc_imported_results where race_id=rid and revision=r.revision;
 for adjustment in
  select * from (select distinct on(driver_id) driver_id,value,created_at,id
   from public.rc_penalties where target_race_id=rid and status in ('active','appealed') and type='position'
   order by driver_id,created_at desc,id desc) latest order by created_at,id
 loop
  if adjustment.driver_id=any(grid) then
   grid:=array_remove(grid,adjustment.driver_id);
   pos:=least(adjustment.value::int,coalesce(array_length(grid,1),0)+1);
   grid:=coalesce(grid[1:pos-1],'{}'::uuid[]) || array[adjustment.driver_id] || coalesce(grid[pos:array_length(grid,1)],'{}'::uuid[]);
  end if;
 end loop;
 select max((original->>'lapsLed')::int),min((original->>'fastestLapTicks')::numeric) into maxled,fastest from public.rc_imported_results where race_id=rid and revision=r.revision;
 for e in
  with adjusted as (
   select ir.*, (ir.original->>'position')::int as original_position,
    coalesce((ir.original->>'disqualified')::boolean,false) or exists(select 1 from public.rc_penalties p where p.target_race_id=rid and p.driver_id=ir.driver_id and p.status in ('active','appealed') and p.type='disqualification') as is_dq,
    array_position(grid,ir.driver_id) as adjusted_position
   from public.rc_imported_results ir where ir.race_id=rid and ir.revision=r.revision
  ) select *, row_number() over(order by is_dq,adjusted_position,original_position,driver_id)::int official_position,
   case when original->>'classId' is not null then row_number() over(partition by original->>'classId' order by is_dq,adjusted_position,original_position,driver_id)::int end official_class_position
   from adjusted
 loop
  pos:=case when c->>'classification'='class' then e.official_class_position else e.official_position end;
  if pos is null then raise exception 'Class scoring requires class identifiers'; end if;
  if (c->>'minimumLaps')::int>0 and e.original->>'laps' is null then raise exception 'Minimum-lap eligibility requires completed laps for every driver'; end if;
  eligible:=e.eligible and coalesce((e.original->>'laps')::int,0)>=(c->>'minimumLaps')::int;
  finish:=coalesce((c->'finish'->>(pos-1))::numeric,(c->>'defaultPoints')::numeric);
  select coalesce(sum(coalesce((c->'stage'->>(st.position-1))::numeric,0)),0) into stagepoints from public.rc_stages st where st.race_id=rid and st.revision=r.revision and st.driver_id=e.driver_id;
  bonus:=0;
  if (c->'bonus'->>'pole')::numeric>0 and e.original->>'startPosition' is null then raise exception 'Pole bonus requires starting positions'; end if;
  if ((c->'bonus'->>'lapLed')::numeric>0 or (c->'bonus'->>'mostLapsLed')::numeric>0) and e.original->>'lapsLed' is null then raise exception 'Lap-led bonuses require laps led'; end if;
  if (c->'bonus'->>'fastestLap')::numeric>0 and fastest is null then raise exception 'Fastest-lap bonus requires lap times'; end if;
  if (e.original->>'startPosition')::int=1 then bonus:=bonus+(c->'bonus'->>'pole')::numeric; end if;
  if (e.original->>'lapsLed')::int>0 then bonus:=bonus+(c->'bonus'->>'lapLed')::numeric; end if;
  if maxled>0 and (e.original->>'lapsLed')::int=maxled then bonus:=bonus+(c->'bonus'->>'mostLapsLed')::numeric; end if;
  if (e.original->>'fastestLapTicks')::numeric=fastest then bonus:=bonus+(c->'bonus'->>'fastestLap')::numeric; end if;
  select coalesce(sum(value),0) into deduction from public.rc_penalties where target_race_id=rid and driver_id=e.driver_id and status in ('active','appealed') and type in ('points','next_race');
  if e.is_dq then finish:=(c->>'dq')::numeric; stagepoints:=0; bonus:=0; end if;
  if not eligible then finish:=0;stagepoints:=0;bonus:=0;end if;
  insert into public.rc_scores(race_id,league_id,season_id,driver_id,revision,team_id,position,class_position,car_number,start_position,laps,incidents,dq,finish_points,stage_points,bonus_points,penalty_points,total_points,team_count,eligible)
  values(rid,r.league_id,r.season_id,e.driver_id,r.revision,e.team_id,e.official_position,e.official_class_position,e.original->>'carNumber',(e.original->>'startPosition')::int,(e.original->>'laps')::int,(e.original->>'incidents')::int,e.is_dq,finish,stagepoints,bonus,deduction,finish+stagepoints+bonus-deduction,(c->>'teamCount')::int,eligible);
 end loop;
end $$;

-- Drop weeks remove the lowest earned race points, but never erase penalty deductions.
-- Starts/wins/finish statistics include all races. Equal drop scores prefer the earlier race.
create view public.rc_driver_standings with(security_invoker=true) as
with ranked as (
 select sc.*,r.starts_at,s.drop_weeks,
  row_number() over(partition by sc.season_id,sc.driver_id order by sc.finish_points+sc.stage_points+sc.bonus_points asc,r.starts_at,sc.race_id) drop_rank,
  count(*) over(partition by sc.season_id,sc.driver_id) race_count
 from public.rc_scores sc join public.rc_races r on r.id=sc.race_id join public.rc_seasons s on s.id=sc.season_id
 where r.status='published' and sc.eligible
), totals as (
 select season_id,league_id,driver_id,count(*)::int starts,
  count(*) filter(where position=1 and not dq)::int wins,count(*) filter(where position<=5 and not dq)::int top5,
  count(*) filter(where position<=10 and not dq)::int top10,count(*) filter(where start_position=1)::int poles,
  round(avg(position),3) average_finish,
  sum(case when drop_rank>least(drop_weeks,greatest(race_count-1,0)) then stage_points else 0 end) stage_points,
  sum(case when drop_rank>least(drop_weeks,greatest(race_count-1,0)) then bonus_points else 0 end) bonus_points,
  sum(penalty_points) penalty_points,
  sum(case when drop_rank>least(drop_weeks,greatest(race_count-1,0)) then finish_points+stage_points+bonus_points else 0 end)-sum(penalty_points) total_points,
  (array_agg(position order by starts_at desc,race_id desc))[1] latest_finish,
  (array_agg(car_number order by starts_at desc,race_id desc))[1] car_number,
  (array_agg(team_id order by starts_at desc,race_id desc))[1] team_id
 from ranked group by season_id,league_id,driver_id
), keys as (
 select t.*,array(select case k when 'wins' then -t.wins when 'top5' then -t.top5 when 'top10' then -t.top10 when 'average_finish' then t.average_finish when 'latest_finish' then t.latest_finish end from unnest(s.tiebreakers) with ordinality as u(k,ord) order by ord) tie_key
 from totals t join public.rc_seasons s on s.id=t.season_id
)
select row_number() over(partition by k.season_id order by k.total_points desc,k.tie_key,k.driver_id)::int championship_position,
 k.*,d.racing_name,tm.name team_name,max(k.total_points) over(partition by k.season_id)-k.total_points gap
from keys k join public.rc_drivers d on d.id=k.driver_id left join public.rc_teams tm on tm.id=k.team_id;

create view public.rc_team_standings with(security_invoker=true) as
with selected as (
 select sc.*,row_number() over(partition by sc.race_id,sc.team_id order by sc.total_points desc,sc.position,sc.driver_id) pick
 from public.rc_scores sc join public.rc_races r on r.id=sc.race_id where r.status='published' and sc.team_id is not null and sc.eligible
), race_totals as (
 select season_id,league_id,team_id,race_id,sum(finish_points+stage_points+bonus_points) earned,sum(penalty_points) deductions,
  min(position) best_finish
 from selected where team_count=0 or pick<=team_count group by season_id,league_id,team_id,race_id
), dropped as (
 select t.*,s.drop_weeks,row_number() over(partition by t.season_id,t.team_id order by earned,r.starts_at,t.race_id) drop_rank,
  count(*) over(partition by t.season_id,t.team_id) race_count
 from race_totals t join public.rc_seasons s on s.id=t.season_id join public.rc_races r on r.id=t.race_id
), totals as (
 select season_id,league_id,team_id,count(*)::int starts,count(*) filter(where best_finish=1)::int wins,
  sum(case when drop_rank>least(drop_weeks,greatest(race_count-1,0)) then earned else 0 end)-sum(deductions) total_points
 from dropped group by season_id,league_id,team_id
)
select row_number() over(partition by t.season_id order by total_points desc,wins desc,team_id)::int championship_position,t.*,tm.name team_name,
 max(total_points) over(partition by t.season_id)-total_points gap
from totals t join public.rc_teams tm on tm.id=t.team_id;
grant select on public.rc_driver_standings,public.rc_team_standings to anon,authenticated;
