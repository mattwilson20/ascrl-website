import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { account, configured, database, rows, one } from "@/lib/supabase";
import {
  Hero,
  Panel,
  Empty,
  SetupNotice,
  StatStrip,
  Card,
  date,
  standingColumns,
  teamColumns,
} from "@/components/ui";
import {
  CommandForm,
  RulesForm,
  UploadForm,
  PublishForm,
  StageCorrection,
  type Field,
  type Option,
} from "@/components/forms";
import { DataTable } from "@/components/data-table";
import type { NormalizedDriver } from "@/lib/importer";
import type { ScoringRules } from "@/lib/rules";
import {
  ChampionshipForm,
  LeagueSettings,
} from "@/components/championship-form";
import { seasonChampionship } from "@/lib/championship-server";

type Row = Record<string, any>;
const options = (items: Row[], label = "name"): Option[] =>
  items.map((i) => ({ value: i.id, label: i[label] || i.id }));
const field = (
  name: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ name, label, type, ...extra });
async function requireUser() {
  if (!configured()) redirect("/setup");
  const user = await account();
  if (!user) redirect("/login");
  return user;
}
async function can(league: string, roles = ["commissioner"]) {
  if (!configured()) return false;
  const db = await database();
  const { data } = await db.rpc("rc_has_role", { l: league, roles });
  return Boolean(data);
}
async function controlLeagues() {
  const user = await requireUser();
  const [all, members] = await Promise.all([
    rows("rc_leagues"),
    rows("rc_memberships", { user_id: user.id }),
  ]);
  const db = await database();
  const { data: owner } = await db.rpc("rc_is_owner");
  return all.filter(
    (l) =>
      owner ||
      members.some(
        (m) =>
          m.league_id === l.id &&
          m.role === "commissioner" &&
          m.status === "active",
      ),
  );
}
async function record(table: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const row = await one(table, id);
  if (!row) notFound();
  return row;
}
const tabs = (s: Row) => (
  <div className="page-tabs">
    <Link href={"/seasons/" + s.id}>Season overview</Link>
    <Link href={"/seasons/" + s.id + "/standings"}>Championship standings</Link>
    <Link href={"/seasons/" + s.id + "/rules"}>
      Rules & championship format
    </Link>
    <Link href={"/leagues/" + s.league_id + "#rulebook"}>League rulebook</Link>
    <Link href={"/leagues/" + s.league_id}>League dashboard</Link>
  </div>
);
function RaceList({ races }: { races: Row[] }) {
  return races.length ? (
    <DataTable
      rows={races.map((r) => ({ ...r, date: date(r.starts_at) }))}
      columns={[
        { key: "name", label: "Race", href: "/races/" },
        { key: "track", label: "Track" },
        { key: "date", label: "Start time · Central" },
        { key: "status", label: "Status" },
        { key: "stage_count", label: "Stages" },
      ]}
      searchLabel="Search races or tracks"
    />
  ) : (
    <Empty title="The calendar is open.">
      Scheduled races will appear here when a commissioner adds them.
    </Empty>
  );
}

async function Home() {
  const [leagues, seasons, races] = await Promise.all([
    rows("rc_leagues"),
    rows("rc_seasons"),
    rows("rc_races"),
  ]);
  return (
    <>
      <section className="home-hero">
        <div className="shell home-grid">
          <div>
            <p className="eyebrow">
              <i />
              ASCRL / CHAMPIONSHIP OPERATIONS
            </p>
            <h1>
              THE RACE ENDS.
              <br />
              THE CHAMPIONSHIP
              <br />
              <em>TAKES SHAPE.</em>
            </h1>
            <p className="lede">
              The home of your league’s official record. Bring the results. Set
              the rules. Follow every driver, every team, and every point.
            </p>
            <div className="actions">
              <Link href="/leagues" className="button">
                Explore the leagues ↗
              </Link>
              <Link href="/admin" className="button secondary">
                Enter Race Control →
              </Link>
            </div>
          </div>
          <img
            className="home-emblem"
            src="/brand/emblem.webp"
            alt="American Stock Car Racing League emblem"
            width="410"
            height="410"
          />
        </div>
        <div className="shell">
          <StatStrip
            items={[
              {
                label: "Leagues on the platform",
                value: configured() ? leagues.length : "—",
              },
              {
                label: "Active championships",
                value: configured()
                  ? seasons.filter((s) => s.status === "active").length
                  : "—",
              },
              {
                label: "Published race results",
                value: configured()
                  ? races.filter((r) => r.status === "published").length
                  : "—",
              },
              { label: "Source of truth", value: "01" },
            ]}
          />
        </div>
      </section>
      <section className="shell section">
        <SetupNotice />
        <div className="section-heading">
          <div>
            <p className="eyebrow">01 / THE CHAMPIONSHIPS</p>
            <h2>YOUR LEAGUE. YOUR GRID.</h2>
          </div>
          <p>
            Published standings and race results, calculated from each
            championship’s own scoring rules.
          </p>
        </div>
        {leagues.length ? (
          <div className="cards">
            {leagues.slice(0, 6).map((l) => (
              <Card
                key={l.id}
                kicker="League headquarters"
                title={l.name}
                description={l.description}
                href={"/leagues/" + l.id}
              />
            ))}
          </div>
        ) : (
          <Empty
            title={
              configured()
                ? "The first green flag starts here."
                : "Race Control is ready to connect."
            }
          >
            {configured() ? (
              <>
                Create the first league in the{" "}
                <Link href="/admin">control room</Link>.
              </>
            ) : (
              <>
                Connect the platform to begin. League results will appear here
                after they are published.
              </>
            )}
          </Empty>
        )}
        <div className="workflow">
          {[
            [
              "01",
              "Build the championship",
              "Create a league, season, calendar, and points system.",
            ],
            [
              "02",
              "Bring the race",
              "Upload the JSON downloaded from the iRacing results screen.",
            ],
            [
              "03",
              "Review the grid",
              "Verify driver matches, stage orders, and the classification.",
            ],
            [
              "04",
              "Make it official",
              "Publish the race and update driver and team championships.",
            ],
          ].map(([n, t, d]) => (
            <div key={n}>
              <b>{n}</b>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
async function Directory() {
  const leagues = await rows("rc_leagues");
  return (
    <>
      <Hero
        eyebrow="The league directory"
        title="Find your racing home."
        description="Independent championships. One ASCRL identity."
        actions={
          <Link className="button" href="/admin">
            Create a league ↗
          </Link>
        }
      />
      <section className="shell section">
        <SetupNotice />
        {leagues.length ? (
          <div className="cards">
            {leagues.map((l) => (
              <Card
                key={l.id}
                title={l.name}
                kicker={l.is_public ? "Public league" : "Member league"}
                description={l.description}
                href={"/leagues/" + l.id}
              />
            ))}
          </div>
        ) : (
          <Empty title="No leagues available yet." />
        )}
      </section>
    </>
  );
}
async function Admin() {
  const user = await requireUser();
  const [leagues, memberships] = await Promise.all([
    controlLeagues(),
    rows("rc_memberships", { user_id: user.id }),
  ]);
  return (
    <>
      <Hero
        eyebrow="Authorized personnel / Control room"
        title="Run the championship."
        description="Manage your leagues, review incoming results, and keep the official record moving."
        actions={
          <>
            <Link href="/imports/new" className="button">
              Import race results ↗
            </Link>
            <Link href="/penalties" className="button secondary">
              Penalties
            </Link>
            <Link href="/incidents" className="button secondary">
              Incident reports
            </Link>
          </>
        }
      />
      <section className="shell section">
        <div className="cards">
          {leagues.map((l) => (
            <Card
              key={l.id}
              kicker="Commissioner access"
              title={l.name}
              href={"/leagues/" + l.id + "/manage"}
              footer="Manage league"
            />
          ))}
        </div>
        {!leagues.length && (
          <Empty title="Create your first league.">
            You can also request membership from a league’s public dashboard.
            Steward and team-owner access is granted by its commissioner.
          </Empty>
        )}
        <div className="two-columns section">
          <Panel title="Start a new league">
            <CommandForm
              name="create_league"
              submit="Create league"
              href="/leagues/:id/manage"
              fields={[
                field("name", "League name"),
                field("slug", "URL name", "text", {
                  hint: "Lowercase letters, numbers, and hyphens.",
                }),
                field("description", "About the league", "textarea", {
                  required: false,
                }),
                field("is_public", "Public league", "checkbox", { value: 1 }),
              ]}
            />
          </Panel>
          <Panel title="My league memberships">
            {memberships.length ? (
              <DataTable
                rows={memberships}
                columns={[
                  {
                    key: "league_id",
                    label: "League ID",
                    href: "/leagues/",
                    idKey: "league_id",
                  },
                  { key: "role", label: "Role" },
                  { key: "status", label: "Status" },
                ]}
              />
            ) : (
              <p className="muted">No memberships yet.</p>
            )}
            <p className="muted">
              Your account ID for commissioner invitations:
            </p>
            <code>{user.id}</code>
          </Panel>
        </div>
      </section>
    </>
  );
}
async function League({
  id,
  manage = false,
}: {
  id: string;
  manage?: boolean;
}) {
  const league = await record("rc_leagues", id);
  const [series, seasons, teams, commissioner, user] = await Promise.all([
    rows("rc_series", { league_id: id }),
    rows("rc_seasons", { league_id: id }),
    rows("rc_teams", { league_id: id }),
    can(id),
    account(),
  ]);
  if (manage && !commissioner) {
    await requireUser();
    notFound();
  }
  return (
    <>
      <Hero
        eyebrow={manage ? "Commissioner workspace" : "League headquarters"}
        title={league.name}
        description={
          league.description ||
          "Series, seasons, teams, and the people behind the championship."
        }
        actions={
          <>
            {commissioner && (
              <>
                <Link className="button" href="/imports/new">
                  Import a race ↗
                </Link>
                <Link
                  className="button secondary"
                  href={"/leagues/" + id + (manage ? "" : "/manage")}
                >
                  {manage ? "Public dashboard" : "Manage league"}
                </Link>
              </>
            )}
            {!commissioner && user && (
              <CommandForm
                name="join_league"
                fixed={{ league_id: id }}
                submit="Request league membership"
              />
            )}
          </>
        }
      />
      <section className="shell section">
        <StatStrip
          items={[
            { label: "Racing series", value: series.length },
            {
              label: "Active seasons",
              value: seasons.filter((s) => s.status === "active").length,
            },
            { label: "Teams", value: teams.length },
            {
              label: "Archived seasons",
              value: seasons.filter((s) => s.status === "archived").length,
            },
          ]}
        />
        <div className="section">
          <div className="section-heading">
            <h2>Championships</h2>
            <p>
              Active seasons and the archives that preserve your league’s
              history.
            </p>
          </div>
          {seasons.length ? (
            <div className="cards">
              {seasons.map((s) => (
                <Card
                  key={s.id}
                  kicker={
                    (series.find((x) => x.id === s.series_id)?.name ||
                      "Series") +
                    " / " +
                    s.status
                  }
                  title={s.name}
                  href={"/seasons/" + s.id}
                />
              ))}
            </div>
          ) : (
            <Empty title="Build the first championship.">
              Add a series, then create its season and scoring rules below.
            </Empty>
          )}
        </div>
        <Panel
          title={"League rulebook · version " + league.rulebook_version}
          id="rulebook"
        >
          {manage ? (
            <LeagueSettings
              key={league.rulebook_version}
              league={{
                id: league.id,
                name: league.name,
                description: league.description,
                rulebook: league.rulebook,
                rulebook_version: league.rulebook_version,
              }}
            />
          ) : league.rulebook ? (
            <div className="rulebook-text">{league.rulebook}</div>
          ) : (
            <p className="muted">
              The commissioner has not published a written rulebook yet.
            </p>
          )}
        </Panel>
        {manage && (
          <LeagueForms
            league={id}
            series={series}
            seasons={seasons}
            teams={teams}
          />
        )}
        <div className="section-heading">
          <h2>The teams</h2>
        </div>
        <div className="cards">
          {teams.map((t) => (
            <Card
              key={t.id}
              kicker="Team profile"
              title={t.name}
              href={"/teams/" + t.id}
              footer="Open team"
            />
          ))}
        </div>
        <div className="section-heading" style={{ marginTop: 35 }}>
          <h2>Series directory</h2>
        </div>
        <div className="page-tabs">
          {series.map((s) => (
            <Link key={s.id} href={"/series/" + s.id}>
              {s.name}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
async function LeagueForms({
  league,
  series,
  seasons,
  teams,
}: {
  league: string;
  series: Row[];
  seasons: Row[];
  teams: Row[];
}) {
  const [members, drivers] = await Promise.all([
    rows("rc_memberships", { league_id: league }),
    rows("rc_drivers"),
  ]);
  const base = { league_id: league };
  return (
    <div className="stack" style={{ marginBottom: 35 }}>
      <div className="two-columns">
        <Panel title="01 / Add a series">
          <CommandForm
            name="create_series"
            fixed={base}
            fields={[field("name", "Series name")]}
            submit="Create series"
          />
        </Panel>
        <Panel title="02 / Create a season">
          {series.length ? (
            <CommandForm
              name="create_season"
              fixed={base}
              fields={[
                field("series_id", "Series", "select", {
                  options: options(series),
                }),
                field("name", "Season name"),
                field("drop_weeks", "Drop weeks", "number", {
                  value: 0,
                  min: 0,
                }),
                field("tiebreakers", "Tiebreaker order", "list", {
                  value: "wins, top5, top10, average_finish, latest_finish",
                  hint: "Supported keys shown above; use any order. Stable driver ID is the final fallback.",
                }),
              ]}
              submit="Create season"
              href="/seasons/:id/rules"
            />
          ) : (
            <p className="muted">Create a series first.</p>
          )}
        </Panel>
      </div>
      <Panel title="03 / Add a scheduled race">
        {seasons.length ? (
          <CommandForm
            name="create_race"
            fixed={base}
            fields={[
              field("season_id", "Season", "select", {
                options: options(seasons.filter((s) => s.status === "active")),
              }),
              field("name", "Race name"),
              field("track", "Track"),
              field(
                "starts_at",
                "Scheduled start · your local time",
                "datetime-local",
              ),
              field("stage_count", "Number of points-paying stages", "number", {
                value: 0,
                min: 0,
              }),
            ]}
            submit="Add to calendar"
          />
        ) : (
          <p className="muted">Create a season first.</p>
        )}
      </Panel>
      <div className="two-columns">
        <Panel title="Teams">
          <CommandForm
            name="create_team"
            fixed={base}
            fields={[
              field("name", "Team name"),
              field("owner_id", "Team owner account ID", "text", {
                required: false,
                hint: "An active team-owner or commissioner account in this league.",
              }),
            ]}
            submit="Create team"
          />
        </Panel>
        <Panel title="Driver registration">
          <CommandForm
            name="create_driver"
            fixed={base}
            fields={[
              field("racing_name", "Racing name"),
              field("customer_id", "iRacing customer ID", "number", { min: 1 }),
              field("car_number", "Car number", "text", { required: false }),
            ]}
            submit="Add driver"
          />
          <p className="muted">
            Imports can create new drivers after explicit approval. Existing
            customer IDs are reused automatically.
          </p>
        </Panel>
      </div>
      <Panel title="League personnel">
        <DataTable
          rows={members}
          columns={[
            { key: "user_id", label: "Account ID" },
            { key: "role", label: "Role" },
            { key: "status", label: "Status" },
          ]}
        />
        <details>
          <summary>Grant or update a league role</summary>
          <CommandForm
            name="membership"
            fixed={base}
            fields={[
              field("user_id", "Account ID"),
              field("role", "Role", "select", {
                options: [
                  "commissioner",
                  "steward",
                  "team_owner",
                  "driver",
                ].map((v) => ({ value: v, label: v.replace("_", " ") })),
              }),
              field("status", "Membership status", "select", {
                options: ["active", "pending", "revoked"].map((v) => ({
                  value: v,
                  label: v,
                })),
              }),
            ]}
            submit="Save membership"
          />
        </details>
      </Panel>
      {seasons.length > 0 && drivers.length > 0 && (
        <Panel title="Season eligibility">
          <p className="muted">
            Approve drivers when a scoring rule uses registered drivers only.
            Eligibility is captured when each race is published; prior race
            points do not change retroactively.
          </p>
          <CommandForm
            name="registration"
            fixed={base}
            fields={[
              field("season_id", "Season", "select", {
                options: options(seasons),
              }),
              field("driver_id", "Driver", "select", {
                options: options(drivers, "racing_name"),
              }),
              field(
                "eligible",
                "Eligible for championship points",
                "checkbox",
                { value: 1 },
              ),
            ]}
            submit="Save eligibility"
          />
        </Panel>
      )}
      <p className="muted">
        Manage dated team rosters from the team profiles below.
      </p>
    </div>
  );
}
async function Series({ id }: { id: string }) {
  const series = await record("rc_series", id),
    seasons = await rows("rc_seasons", { series_id: id });
  return (
    <>
      <Hero
        eyebrow="Series dashboard"
        title={series.name}
        actions={
          <Link
            className="button secondary"
            href={"/leagues/" + series.league_id}
          >
            League headquarters
          </Link>
        }
      />
      <section className="shell section">
        <div className="cards">
          {seasons.map((s) => (
            <Card
              key={s.id}
              title={s.name}
              kicker={s.status}
              href={"/seasons/" + s.id}
            />
          ))}
        </div>
        {!seasons.length && <Empty title="No seasons yet." />}
      </section>
    </>
  );
}
async function Season({ id, section }: { id: string; section?: string }) {
  const s = await record("rc_seasons", id);
  const [championship, teams, races, ruleVersions, commissioner] =
    await Promise.all([
      seasonChampionship(id),
      rows("rc_team_standings", { season_id: id }, "championship_position"),
      rows("rc_races", { season_id: id }, "scheduled_at"),
      rows("rc_scoring_rules", { season_id: id }, "version"),
      can(s.league_id),
    ]);
  const current = ruleVersions.find((r) => r.id === s.active_rule_id);
  const drivers = championship.rows;
  const advanced = s.championship_config.mode !== "full_season";
  return (
    <>
      <Hero
        eyebrow={"Championship / " + s.status}
        title={section === "rules" ? "Your championship. Your rules." : s.name}
        description={
          section === "rules"
            ? "Build your points system, choose a championship format, and publish your league’s own rulebook."
            : "Follow the points battle and the race weekends that shape it."
        }
        actions={
          commissioner ? (
            <Link href="/imports/new" className="button">
              Import results ↗
            </Link>
          ) : undefined
        }
      />
      <section className="shell section">
        {tabs(s)}
        <SeasonRegistration season={s} />
        {section === "rules" ? (
          <>
            <Panel
              title={"Championship format · version " + s.championship_version}
            >
              <ChampionshipForm
                key={s.championship_version}
                season={{
                  id: s.id,
                  league_id: s.league_id,
                  name: s.name,
                  championship_config: s.championship_config,
                  championship_version: s.championship_version,
                  drop_weeks: s.drop_weeks,
                  tiebreakers: s.tiebreakers,
                }}
                locked={
                  s.status === "archived" ||
                  races.some((r) => r.status === "published")
                }
                editable={commissioner}
                calendarCount={races.length}
              />
            </Panel>
            <Panel
              title={
                current
                  ? "Current rules · version " + current.version
                  : "Configure the first scoring rules"
              }
            >
              {commissioner && s.status !== "archived" ? (
                <RulesForm
                  league={s.league_id}
                  season={s.id}
                  initial={current?.config as ScoringRules}
                />
              ) : current ? (
                <>
                  <p className="muted">{current.name}</p>
                  <DataTable
                    rows={current.config.finish.map((p: number, i: number) => ({
                      position: i + 1,
                      points: p,
                    }))}
                    columns={[
                      { key: "position", label: "Finish" },
                      { key: "points", label: "Points" },
                    ]}
                  />
                  <dl className="data-list">
                    {Object.entries(current.config.bonus).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  <h3>Stage points</h3>
                  <p className="muted">
                    {current.config.stage.length
                      ? current.config.stage
                          .map((p: number, i: number) => `P${i + 1}: ${p}`)
                          .join(" · ")
                      : "No stage points"}
                  </p>
                  <dl className="data-list">
                    <div>
                      <dt>Classification</dt>
                      <dd>{current.config.classification}</dd>
                    </div>
                    <div>
                      <dt>Eligibility</dt>
                      <dd>
                        {current.config.eligibility} · minimum{" "}
                        {current.config.minimumLaps} laps
                      </dd>
                    </div>
                    <div>
                      <dt>Disqualification</dt>
                      <dd>{current.config.dq} points</dd>
                    </div>
                    <div>
                      <dt>Beyond the finish table</dt>
                      <dd>{current.config.defaultPoints} points</dd>
                    </div>
                    <div>
                      <dt>Team entries counted</dt>
                      <dd>{current.config.teamCount || "All"}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <Empty title="Scoring rules not configured." />
              )}
            </Panel>
            <Panel title="Season policy">
              <dl className="data-list">
                <div>
                  <dt>Drop weeks</dt>
                  <dd>{s.drop_weeks} · at least one scored race is retained</dd>
                </div>
                <div>
                  <dt>Tiebreaker order</dt>
                  <dd>{s.tiebreakers.join(" → ")}</dd>
                </div>
              </dl>
              <p className="muted" style={{ marginTop: 20 }}>
                Drop weeks remove earned race points, never penalties. Tied
                fastest laps and most laps led award the configured bonus to
                each tied driver. A pole bonus follows the imported first grid
                slot. Disqualification removes stage and bonus points.
              </p>
            </Panel>
            <DataTable
              rows={ruleVersions.map((r) => ({
                ...r,
                date: date(r.created_at),
              }))}
              columns={[
                { key: "version", label: "Version" },
                { key: "name", label: "Rules" },
                { key: "date", label: "Created" },
              ]}
            />
          </>
        ) : (
          <>
            <StatStrip
              items={[
                {
                  label: "Published races",
                  value: races.filter((r) => r.status === "published").length,
                },
                { label: "Drivers in standings", value: drivers.length },
                { label: "Teams in standings", value: teams.length },
                {
                  label: "Scoring rule version",
                  value: current?.version ?? "—",
                },
              ]}
            />
            <div className="section">
              <div className="section-heading">
                <h2>Driver championship</h2>
                <p>{championship.phase}. Search by driver, number, or team.</p>
              </div>
              {drivers.length ? (
                <DataTable
                  rows={drivers}
                  columns={
                    advanced
                      ? [
                          ...standingColumns.slice(0, 2),
                          {
                            key: "championship_status",
                            label: "Championship status",
                          },
                          ...standingColumns.slice(2),
                          { key: "season_points", label: "Full-season points" },
                        ]
                      : standingColumns
                  }
                  searchLabel="Search drivers, numbers, teams"
                />
              ) : (
                <Empty title="The championship is waiting for its first result.">
                  {commissioner ? (
                    <Link
                      href={
                        current ? "/imports/new" : "/seasons/" + id + "/rules"
                      }
                    >
                      {current
                        ? "Import and publish a race"
                        : "Configure the scoring rules"}{" "}
                      →
                    </Link>
                  ) : (
                    <>Standings appear after race results are published.</>
                  )}
                </Empty>
              )}
              <div className="section-heading" style={{ marginTop: 35 }}>
                <h2>
                  Team championship{advanced ? " · full-season points" : ""}
                </h2>
              </div>
              {teams.length ? (
                <DataTable rows={teams} columns={teamColumns} />
              ) : (
                <Empty title="No scored team entries yet." />
              )}
            </div>
            {section !== "standings" && (
              <>
                <div className="section-heading">
                  <h2>Race calendar</h2>
                </div>
                <RaceList races={races} />
              </>
            )}
            {commissioner && s.status === "active" && (
              <details>
                <summary>Archive this season</summary>
                <p className="muted">
                  Archives remain publicly readable. Archiving locks new imports
                  and scoring-rule versions.
                </p>
                <CommandForm
                  name="archive_season"
                  fixed={{ league_id: s.league_id, season_id: s.id }}
                  submit="Archive season"
                />
              </details>
            )}
          </>
        )}
      </section>
    </>
  );
}
async function SeasonRegistration({ season }: { season: Row }) {
  const user = await account();
  if (!user || season.status === "archived") return null;
  const db = await database();
  const { data: driver } = await db.rpc("rc_my_driver");
  if (
    !driver ||
    !(await can(season.league_id, [
      "driver",
      "team_owner",
      "steward",
      "commissioner",
    ]))
  )
    return null;
  const registered = await rows("rc_registrations", {
    season_id: season.id,
    driver_id: driver,
  });
  return registered.length ? (
    <p className="notice">
      Your season registration:{" "}
      {registered[0].eligible
        ? "approved for points"
        : "awaiting commissioner approval"}
      .
    </p>
  ) : (
    <Panel title="Join this championship">
      <CommandForm
        name="register"
        fixed={{
          league_id: season.league_id,
          season_id: season.id,
          driver_id: driver,
        }}
        submit="Request season registration"
      />
    </Panel>
  );
}
async function NewImport() {
  const choices = (records: Row[]) =>
    records.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      league_id: r.league_id as string,
      series_id: r.series_id as string,
      season_id: r.season_id as string,
      status: r.status as string,
    }));
  const leagues = await controlLeagues();
  const ids = leagues.map((l) => l.id);
  const [series, seasons, races, imports] = await Promise.all([
    rows("rc_series"),
    rows("rc_seasons"),
    rows("rc_races"),
    rows("rc_imports"),
  ]);
  return (
    <>
      <Hero
        eyebrow="Race Control / Results intake"
        title="Bring the race."
        description="Upload the original event-result JSON, review the grid, and publish one official classification."
      />
      <section className="shell section">
        {!leagues.length ? (
          <Empty title="Commissioner access required.">
            Create a league or ask its commissioner to grant you access.
          </Empty>
        ) : (
          <>
            <Panel title="01 / Select the championship">
              <UploadForm
                leagues={choices(leagues)}
                series={choices(
                  series.filter((s) => ids.includes(s.league_id)),
                )}
                seasons={choices(
                  seasons.filter((s) => ids.includes(s.league_id)),
                )}
                races={choices(races.filter((r) => ids.includes(r.league_id)))}
              />
            </Panel>
            <Panel title="Recent imports">
              <DataTable
                rows={imports
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((j) => ({ ...j, date: date(j.created_at) }))}
                columns={[
                  {
                    key: "subsession_id",
                    label: "Subsession",
                    href: "/imports/",
                  },
                  { key: "source_track", label: "Track" },
                  { key: "status", label: "Status" },
                  { key: "date", label: "Submitted" },
                ]}
              />
            </Panel>
          </>
        )}
      </section>
    </>
  );
}
async function ImportPreview({ id }: { id: string }) {
  await requireUser();
  const j = await record("rc_imports", id),
    r = await record("rc_races", j.race_id),
    s = await record("rc_seasons", j.season_id);
  if (j.status === "committed") redirect("/races/" + j.race_id);
  const db = await database();
  const drivers = (j.payload ?? []) as NormalizedDriver[];
  const { data: identities, error } = await db
    .from("rc_driver_identities")
    .select("driver_id,customer_id")
    .in(
      "customer_id",
      drivers.map((d) => d.customerId),
    );
  if (error) throw new Error(error.message);
  const known = (identities ?? [])
    .filter((i) => drivers.some((d) => d.customerId === i.customer_id))
    .map((i) => i.customer_id);
  const rule =
    r.rule_id || s.active_rule_id
      ? await one("rc_scoring_rules", r.rule_id || s.active_rule_id)
      : null;
  return (
    <>
      <Hero
        eyebrow="Results intake / Preview"
        title="Review the classification."
        description="No points have been awarded. Publishing writes the drivers, results, stages, and scores in one database transaction."
      />
      <section className="shell section">
        <div className="two-columns">
          <Panel title="Source event">
            <dl className="data-list">
              <div>
                <dt>Track</dt>
                <dd>{j.source_track}</dd>
              </div>
              <div>
                <dt>Start time</dt>
                <dd>{date(j.source_date)}</dd>
              </div>
              <div>
                <dt>Subsession</dt>
                <dd>{j.subsession_id}</dd>
              </div>
              <div>
                <dt>Session / race segment</dt>
                <dd>
                  {j.source_session_id ?? "—"} / {j.source_race_session ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Drivers</dt>
                <dd>{drivers.length}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Selected championship race">
            <dl className="data-list">
              <div>
                <dt>Race</dt>
                <dd>{r.name}</dd>
              </div>
              <div>
                <dt>Scheduled track</dt>
                <dd>{r.track}</dd>
              </div>
              <div>
                <dt>Scheduled start</dt>
                <dd>{date(r.starts_at)}</dd>
              </div>
              <div>
                <dt>Scoring rules</dt>
                <dd>
                  {rule ? rule.name + " · v" + rule.version : "Not configured"}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
        {j.correction_reason && (
          <div className="notice warning">
            <strong>Correction to revision {j.expected_revision}.</strong>{" "}
            {j.correction_reason}
          </div>
        )}
        <div className="notice">
          Publishing adopts the verified source date and track for this race.
          Check both panels before confirming.
        </div>
        {(j.warnings as string[]).map((w, i) => (
          <p key={i} className="muted">
            • {w}
          </p>
        ))}
        <DataTable
          rows={drivers.map((d) => ({
            ...d,
            match: known.includes(d.customerId)
              ? "Matched"
              : "Approval required",
          }))}
          columns={[
            { key: "position", label: "Finish" },
            { key: "name", label: "Driver" },
            { key: "customerId", label: "Customer ID" },
            { key: "match", label: "Match" },
            { key: "carNumber", label: "#" },
            { key: "startPosition", label: "Start" },
            { key: "classPosition", label: "Class" },
            { key: "laps", label: "Laps" },
            { key: "lapsLed", label: "Led" },
            { key: "incidents", label: "Incidents" },
            { key: "fastestLapTicks", label: "Best lap · ticks" },
            { key: "reasonOut", label: "Status" },
          ]}
        />
        {j.status === "preview" && new Date(j.expires_at) > new Date() ? (
          rule ? (
            <Panel title="02 / Confirm & publish">
              <PublishForm
                id={j.id}
                drivers={drivers}
                known={known}
                stages={r.stage_count}
                scoringPlaces={rule.config.stage.length}
              />
            </Panel>
          ) : (
            <Empty title="Scoring rules are required.">
              <Link href={"/seasons/" + s.id + "/rules"}>
                Configure the points system first →
              </Link>
            </Empty>
          )
        ) : (
          <Empty title="This preview has expired.">
            <Link href="/imports/new">Upload the file again →</Link>
          </Empty>
        )}
        {j.status === "preview" && (
          <CommandForm
            name="cancel_import"
            fixed={{ job: j.id }}
            submit="Discard this preview"
            href="/imports/new"
          />
        )}
      </section>
    </>
  );
}
async function Race({ id }: { id: string }) {
  const r = await record("rc_races", id);
  const [scores, drivers, commissioner, steward] = await Promise.all([
    rows("rc_scores", { race_id: id }, "position"),
    rows("rc_drivers"),
    can(r.league_id),
    can(r.league_id, ["commissioner", "steward"]),
  ]);
  const grid = scores.map((sc) => ({
    ...sc,
    racing_name:
      drivers.find((d) => d.id === sc.driver_id)?.racing_name ?? "Driver",
  }));
  const rule = r.rule_id ? await one("rc_scoring_rules", r.rule_id) : null;
  let stageDrivers: { customerId: number; name: string }[] = [];
  if (commissioner && r.stage_count) {
    const original = await rows("rc_imported_results", {
      race_id: id,
      revision: String(r.revision),
    });
    stageDrivers = original.map((o) => ({
      customerId: o.original.customerId,
      name: o.original.name,
    }));
  }
  return (
    <>
      <Hero
        eyebrow={"Race classification / " + r.status}
        title={r.name}
        description={r.track + " · " + date(r.starts_at)}
        actions={
          <>
            <Link
              className="button secondary"
              href={"/seasons/" + r.season_id + "/standings"}
            >
              Championship standings
            </Link>
            {commissioner && (
              <Link className="button" href="/imports/new">
                {r.status === "published"
                  ? "Import a correction"
                  : "Import results"}{" "}
                ↗
              </Link>
            )}
          </>
        }
      />
      <section className="shell section">
        <StatStrip
          items={[
            { label: "Classified drivers", value: scores.length },
            { label: "Race revision", value: r.revision },
            { label: "Points-paying stages", value: r.stage_count },
            { label: "Scoring version", value: rule?.version ?? "—" },
          ]}
        />
        <div className="section">
          {grid.length ? (
            <DataTable
              rows={grid}
              columns={[
                { key: "position", label: "Pos" },
                {
                  key: "racing_name",
                  label: "Driver",
                  href: "/drivers/",
                  idKey: "driver_id",
                },
                { key: "car_number", label: "#" },
                { key: "class_position", label: "Class" },
                { key: "start_position", label: "Start" },
                { key: "laps", label: "Laps" },
                { key: "incidents", label: "Incidents" },
                { key: "dq", label: "DQ" },
                { key: "eligible", label: "Eligible" },
                { key: "finish_points", label: "Finish pts" },
                { key: "stage_points", label: "Stage" },
                { key: "bonus_points", label: "Bonus" },
                { key: "penalty_points", label: "Penalty" },
                { key: "total_points", label: "Total" },
              ]}
            />
          ) : (
            <Empty title="Results have not been published." />
          )}
        </div>
        {rule && (
          <p className="muted">
            Scored with {rule.name}, version {rule.version}. Original imported
            results and every correction are retained in the private audit
            history.
          </p>
        )}
        {steward && grid.length > 0 && (
          <Panel title="Stewards’ desk">
            <PenaltyForm race={r} grid={grid} />
          </Panel>
        )}
        {commissioner && r.stage_count > 0 && rule && grid.length > 0 && (
          <Panel title="Correct stage scoring">
            <StageCorrection
              race={r.id}
              drivers={stageDrivers}
              count={r.stage_count}
              scoringPlaces={rule.config.stage.length}
            />
          </Panel>
        )}
        {r.status === "published" && <IncidentReport race={r} grid={grid} />}
        <Link className="button secondary" href="/incidents">
          Incident reports →
        </Link>
        {steward && <Audit league={r.league_id} entity={r.id} />}
      </section>
    </>
  );
}
async function IncidentReport({ race, grid }: { race: Row; grid: Row[] }) {
  if (!(await account())) return null;
  return (
    <details>
      <summary>Report an incident</summary>
      <p className="muted">
        Participating drivers with a verified identity may submit evidence for
        league stewards.
      </p>
      <CommandForm
        name="incident"
        fixed={{ race_id: race.id }}
        fields={[
          field("driver_id", "Driver involved", "select", {
            options: grid.map((r) => ({
              value: r.driver_id,
              label: r.racing_name,
            })),
          }),
          field("lap", "Lap", "number", { value: 0, min: 0 }),
          field("statement", "What happened?", "textarea"),
          field("evidence_url", "Replay or evidence link · HTTPS", "text", {
            required: false,
          }),
        ]}
        submit="Submit incident report"
        href="/incidents"
      />
    </details>
  );
}
async function Incidents() {
  await requireUser();
  const incidents = await rows("rc_incidents"),
    races = await rows("rc_races"),
    drivers = await rows("rc_drivers");
  return (
    <>
      <Hero
        eyebrow="Stewards’ desk / Incident review"
        title="Review the racing."
        description="Driver reports and steward decisions, visible to the reporter and authorized league officials."
      />
      <section className="shell section">
        {!incidents.length && (
          <Empty title="No incident reports available.">
            Report an incident from its published race page.
          </Empty>
        )}
        <div className="stack">
          {await Promise.all(
            incidents.map(async (i) => (
              <Panel
                key={i.id}
                title={
                  (drivers.find((d) => d.id === i.driver_id)?.racing_name ||
                    "Driver") +
                  " · Lap " +
                  i.lap
                }
              >
                <p>
                  <span className="badge">{i.status}</span> {date(i.created_at)}
                </p>
                <Link href={"/races/" + i.race_id}>
                  {races.find((r) => r.id === i.race_id)?.name ||
                    "Race results"}{" "}
                  →
                </Link>
                <p>{i.statement}</p>
                {i.evidence_url && (
                  <a
                    href={i.evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open supporting evidence ↗
                  </a>
                )}
                {i.decision && (
                  <p className="notice">Steward decision: {i.decision}</p>
                )}
                {(await can(i.league_id, ["commissioner", "steward"])) && (
                  <CommandForm
                    name="incident"
                    fixed={{ id: i.id }}
                    fields={[
                      field("status", "Review outcome", "select", {
                        options: [
                          { value: "reviewed", label: "Reviewed" },
                          { value: "dismissed", label: "Dismissed" },
                        ],
                      }),
                      field("decision", "Decision rationale", "textarea"),
                    ]}
                    submit="Record review"
                  />
                )}
                <p className="muted">
                  Any resulting penalty is proposed and confirmed separately on
                  the race results page.
                </p>
              </Panel>
            )),
          )}
        </div>
      </section>
    </>
  );
}
async function PenaltyForm({ race, grid }: { race: Row; grid: Row[] }) {
  const future = (await rows("rc_races", { season_id: race.season_id })).filter(
    (r) => new Date(r.starts_at) > new Date(race.starts_at),
  );
  return (
    <>
      <p className="muted">
        New penalties are pending until a steward confirms them. Appeals retain
        the active decision until it is overturned. Next-race penalties deduct
        points from the selected later race.
      </p>
      <CommandForm
        name="penalty"
        fixed={{ race_id: race.id }}
        fields={[
          field("driver_id", "Driver", "select", {
            options: grid.map((r) => ({
              value: r.driver_id,
              label: r.racing_name,
            })),
          }),
          field("type", "Penalty type", "select", {
            options: [
              "points",
              "position",
              "disqualification",
              "warning",
              "suspension",
              "next_race",
            ].map((v) => ({ value: v, label: v.replace("_", " ") })),
          }),
          field(
            "value",
            "Points, suspension points, or adjusted position",
            "number",
            { value: 0, min: 0 },
          ),
          field("target_race_id", "Apply at race", "select", {
            options: [
              {
                value: race.id,
                label: "This race (all types except next race)",
              },
              ...options(future),
            ],
          }),
          field("reason", "Reason", "textarea"),
          field("notes", "Supporting notes · private", "textarea", {
            required: false,
          }),
        ]}
        submit="Propose penalty"
        href="/penalties"
      />
    </>
  );
}
async function Penalties() {
  await requireUser();
  const all = await rows("rc_penalties"),
    drivers = await rows("rc_drivers"),
    races = await rows("rc_races");
  const db = await database();
  const { data: ownDriver } = await db.rpc("rc_my_driver");
  return (
    <>
      <Hero
        eyebrow="Stewards’ desk / Decisions & appeals"
        title="Keep the racing fair."
        description="Review pending decisions, confirm penalties, and resolve driver appeals with a complete audit history."
      />
      <section className="shell section">
        {!all.length && (
          <Empty title="No penalty records available.">
            Authorized stewards can propose a penalty from a published race’s
            results page.
          </Empty>
        )}
        <div className="stack">
          {await Promise.all(
            all.map(async (p) => {
              const staff = await can(p.league_id, ["commissioner", "steward"]);
              const appeals = await rows("rc_appeals", { penalty_id: p.id });
              return (
                <Panel
                  key={p.id}
                  title={
                    drivers.find((d) => d.id === p.driver_id)?.racing_name ||
                    "Driver"
                  }
                >
                  <div className="section-heading">
                    <p>
                      <span className="badge">{p.status}</span>{" "}
                      {p.type.replace("_", " ")} · {p.value}
                    </p>
                    <Link href={"/races/" + p.race_id}>
                      {races.find((r) => r.id === p.race_id)?.name ||
                        "View race"}{" "}
                      →
                    </Link>
                  </div>
                  <p>{p.reason}</p>
                  <p className="muted">
                    Issued {date(p.created_at)} · Administrator {p.issued_by}
                  </p>
                  {p.notes && <p className="muted">Notes: {p.notes}</p>}
                  {appeals.map((a) => (
                    <div key={a.id} className="notice">
                      <strong>Driver appeal:</strong> {a.statement}
                    </div>
                  ))}
                  {staff ? (
                    <CommandForm
                      name="penalty"
                      fixed={{ id: p.id }}
                      fields={[
                        field("status", "Decision", "select", {
                          options: [
                            {
                              value: "active",
                              label: "Confirm / uphold active penalty",
                            },
                            { value: "overturned", label: "Overturn penalty" },
                          ],
                        }),
                        field("reason", "Decision rationale", "textarea"),
                      ]}
                      submit="Record decision"
                    />
                  ) : p.driver_id === ownDriver && p.status === "active" ? (
                    <CommandForm
                      name="appeal"
                      fixed={{ penalty: p.id }}
                      fields={[
                        field("statement", "Appeal statement", "textarea"),
                      ]}
                      submit="Submit appeal"
                    />
                  ) : null}
                </Panel>
              );
            }),
          )}
        </div>
      </section>
    </>
  );
}
async function Driver({ id }: { id: string }) {
  const driver = await record("rc_drivers", id);
  const [rawStats, scores, seasons, races, leagues, series] = await Promise.all(
    [
      rows("rc_driver_standings", { driver_id: id }),
      rows("rc_scores", { driver_id: id }),
      rows("rc_seasons"),
      rows("rc_races"),
      rows("rc_leagues"),
      rows("rc_series"),
    ],
  );
  const stats = await Promise.all(
    rawStats.map(async (entry) => {
      const season = seasons.find((s) => s.id === entry.season_id);
      if (!season || season.championship_config.mode === "full_season")
        return entry;
      const championship = await seasonChampionship(entry.season_id);
      return {
        ...entry,
        ...championship.rows.find((s) => s.driver_id === id),
        championship_complete: championship.complete,
      };
    }),
  );
  const sum = (key: string) =>
    stats.reduce((n, r) => n + Number(r[key] || 0), 0);
  const titles = stats.filter(
    (r) =>
      r.championship_position === 1 &&
      r.championship_complete !== false &&
      seasons.find((s) => s.id === r.season_id)?.status === "archived",
  ).length;
  return (
    <>
      <Hero
        eyebrow="ASCRL driver identity / Career record"
        title={driver.racing_name}
        description="The championship record across ASCRL leagues, series, and seasons."
      />
      <section className="shell section">
        <StatStrip
          items={[
            { label: "Career starts", value: sum("starts") },
            { label: "Career wins", value: sum("wins") },
            { label: "Career top 5s", value: sum("top5") },
            { label: "Championship titles", value: titles },
          ]}
        />
        <div className="section">
          <h2>Season by season</h2>
          <DataTable
            rows={stats.map((s) => ({
              ...s,
              name: seasons.find((x) => x.id === s.season_id)?.name || "Season",
              league: leagues.find((l) => l.id === s.league_id)?.name,
              series: series.find(
                (x) =>
                  x.id ===
                  seasons.find((se) => se.id === s.season_id)?.series_id,
              )?.name,
            }))}
            columns={[
              {
                key: "name",
                label: "Season",
                href: "/seasons/",
                idKey: "season_id",
              },
              {
                key: "league",
                label: "League",
                href: "/leagues/",
                idKey: "league_id",
              },
              { key: "series", label: "Series" },
              { key: "championship_position", label: "Championship" },
              {
                key: "team_name",
                label: "Team",
                href: "/teams/",
                idKey: "team_id",
              },
              { key: "starts", label: "Starts" },
              { key: "wins", label: "Wins" },
              { key: "top5", label: "Top 5" },
              { key: "top10", label: "Top 10" },
              { key: "total_points", label: "Points" },
            ]}
          />
          <h2>Race history</h2>
          <DataTable
            rows={scores.map((sc) => ({
              ...sc,
              name: races.find((r) => r.id === sc.race_id)?.name || "Race",
            }))}
            columns={[
              { key: "name", label: "Race", href: "/races/", idKey: "race_id" },
              { key: "position", label: "Finish" },
              { key: "start_position", label: "Start" },
              { key: "laps", label: "Laps" },
              { key: "total_points", label: "Points" },
            ]}
          />
        </div>
      </section>
    </>
  );
}
async function Team({ id }: { id: string }) {
  const team = await record("rc_teams", id);
  const [members, drivers, standings, user, commissioner] = await Promise.all([
    rows("rc_team_memberships", { team_id: id }),
    rows("rc_drivers"),
    rows("rc_team_standings", { team_id: id }),
    account(),
    can(team.league_id),
  ]);
  const owner =
    user?.id === team.owner_id && (await can(team.league_id, ["team_owner"]));
  return (
    <>
      <Hero
        eyebrow="The organizations / Team profile"
        title={team.name}
        description="A dated roster and a permanent championship record. Team changes apply to future race snapshots."
      />
      <section className="shell section">
        <h2>Championship record</h2>
        <DataTable
          rows={standings}
          columns={[
            {
              key: "season_id",
              label: "Season",
              href: "/seasons/",
              idKey: "season_id",
            },
            ...teamColumns.filter((c) => c.key !== "team_name"),
          ]}
        />
        <h2>Roster history</h2>
        <DataTable
          rows={members.map((m) => ({
            ...m,
            name:
              drivers.find((d) => d.id === m.driver_id)?.racing_name ||
              m.driver_id,
            from: date(m.valid_from),
            until: m.valid_until ? date(m.valid_until) : "Current",
          }))}
          columns={[
            {
              key: "name",
              label: "Driver",
              href: "/drivers/",
              idKey: "driver_id",
            },
            { key: "from", label: "From" },
            { key: "until", label: "Until" },
            { key: "id", label: "Membership ID" },
          ]}
        />
        {(commissioner || owner) && (
          <Panel title="Add a dated roster membership">
            <CommandForm
              name="roster"
              fixed={{ league_id: team.league_id, team_id: team.id }}
              fields={[
                field("driver_id", "Driver", "select", {
                  options: options(drivers, "racing_name"),
                }),
                field(
                  "valid_from",
                  "Effective from · your local time",
                  "datetime-local",
                ),
              ]}
              submit="Add to team"
            />
            {commissioner && (
              <details>
                <summary>End a previous membership</summary>
                <CommandForm
                  name="end_roster"
                  fixed={{ league_id: team.league_id }}
                  fields={[
                    field("id", "Membership", "select", {
                      options: members
                        .filter((m) => !m.valid_until)
                        .map((m) => ({
                          value: m.id,
                          label:
                            drivers.find((d) => d.id === m.driver_id)
                              ?.racing_name || m.id,
                        })),
                    }),
                    field(
                      "valid_until",
                      "End time · your local time",
                      "datetime-local",
                    ),
                  ]}
                  submit="End membership"
                />
              </details>
            )}
          </Panel>
        )}
      </section>
    </>
  );
}
async function Settings() {
  const user = await requireUser(),
    profiles = await rows("rc_profiles", { id: user.id }),
    db = await database();
  const { data: driver } = await db.rpc("rc_my_driver"),
    { data: owner } = await db.rpc("rc_is_owner");
  return (
    <>
      <Hero
        eyebrow="My account / ASCRL identity"
        title="Your place on the grid."
      />
      <section className="shell section">
        <div className="two-columns">
          <Panel title="Public racing name">
            <CommandForm
              name="profile"
              fields={[
                field("display_name", "Racing name", "text", {
                  value: profiles[0]?.display_name || "",
                }),
              ]}
              submit="Update profile"
            />
          </Panel>
          <Panel title="Account & driver verification">
            <p>Your account ID:</p>
            <code>{user.id}</code>
            <p className="muted" style={{ marginTop: 20 }}>
              Share this ID with a commissioner for a league role. A platform
              owner verifies the connection to your iRacing customer ID before
              you can claim imported results or appeal penalties.
            </p>
            {driver ? (
              <Link className="button secondary" href={"/drivers/" + driver}>
                View my driver profile
              </Link>
            ) : (
              <span className="badge">Driver identity not linked</span>
            )}
          </Panel>
        </div>
        {owner && (
          <Panel title="Platform owner / Verify a driver account">
            <CommandForm
              name="link_identity"
              fields={[
                field("driver_id", "Driver record UUID"),
                field("account_id", "Verified account UUID"),
              ]}
              submit="Link verified identity"
            />
          </Panel>
        )}
      </section>
    </>
  );
}
async function Audit({ league, entity }: { league: string; entity?: string }) {
  const logs = await rows("rc_audit", {
    league_id: league,
    ...(entity ? { entity_id: entity } : {}),
  });
  return (
    <details>
      <summary>Audit history</summary>
      <DataTable
        rows={logs.map((l) => ({
          ...l,
          date: date(l.created_at),
          details: JSON.stringify(l.details),
        }))}
        columns={[
          { key: "date", label: "Time" },
          { key: "action", label: "Action" },
          { key: "actor_id", label: "Administrator" },
          { key: "details", label: "Details" },
        ]}
      />
    </details>
  );
}
function Setup() {
  return (
    <>
      <Hero
        eyebrow="Platform setup / Deployment guide"
        title="Connect Race Control."
        description="The application uses a dedicated database and Discord sign-in. Your public ASCRL website stays on its existing hosting."
      />
      <section className="shell section">
        <Panel title="Production destination">
          <h3>racecontrol.ascrl.online</h3>
          <p className="muted">
            No service credentials are included in this repository. Complete
            these steps to activate your deployment.
          </p>
        </Panel>
        <Panel title="Setup checklist">
          <ol className="steps">
            <li>
              <strong>Create a dedicated Supabase project</strong>Use its SQL
              editor or Supabase CLI to apply the migrations in{" "}
              <code>racecontrol/supabase/migrations</code> in filename order.
            </li>
            <li>
              <strong>Configure Discord OAuth</strong>Create an application in
              the{" "}
              <a href="https://discord.com/developers/applications">
                Discord Developer Portal
              </a>
              . Add the Supabase Auth callback URL. Put the Discord client ID
              and secret in Supabase’s Discord provider settings.
            </li>
            <li>
              <strong>Configure environment variables</strong>Copy{" "}
              <code>.env.example</code> to <code>.env.local</code> for local
              development. Set the Supabase URL, public publishable key, and
              site URL. No service-role key is used.
            </li>
            <li>
              <strong>Deploy to Vercel</strong>Import the feature branch and
              choose <code>racecontrol</code> as the root directory. Add the
              same variables. Set the site URL to{" "}
              <code>https://racecontrol.ascrl.online</code>.
            </li>
            <li>
              <strong>Finish redirects and the subdomain</strong>Add the
              application’s <code>/auth/callback</code> URL to Supabase’s
              redirect allow list. Add the subdomain in Vercel and apply the
              exact DNS record Vercel provides.
            </li>
            <li>
              <strong>Sign in and bootstrap the platform owner</strong>After
              your first Discord login, copy your account UUID from Settings and
              follow the owner bootstrap SQL in the README. Then create your
              first league.
            </li>
          </ol>
          <a
            className="button secondary"
            href="https://github.com/mattwilson20/ascrl-website/tree/codex/ascrl-race-control/racecontrol"
          >
            Full setup & operating guide ↗
          </a>
        </Panel>
      </section>
    </>
  );
}
function Login({ error = false }: { error?: boolean }) {
  return (
    <>
      <Hero
        eyebrow="Authorized access / Discord"
        title="Welcome to Race Control."
        description="Use your Discord account to manage a league, join a championship, or maintain your driver identity."
      />
      <section className="shell section">
        <Panel title="Sign in">
          {error && (
            <p className="error" role="alert">
              Discord sign-in could not finish. Try again; if it continues,
              check the provider credentials and callback URLs in the setup
              guide.
            </p>
          )}
          <p className="muted">
            League permissions are assigned inside Race Control. Discord server
            roles do not grant championship access.
          </p>
          <a className="button" href={configured() ? "/auth/login" : "/setup"}>
            {configured()
              ? "Continue with Discord ↗"
              : "Configure the platform first →"}
          </a>
        </Panel>
      </section>
    </>
  );
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const path = (await params).path ?? [];
  if (!path.length) return <Home />;
  if (path.length === 1) {
    switch (path[0]) {
      case "leagues":
        return <Directory />;
      case "admin":
        return <Admin />;
      case "settings":
        return <Settings />;
      case "penalties":
        return <Penalties />;
      case "incidents":
        return <Incidents />;
      case "setup":
        return <Setup />;
      case "login":
        return <Login error={Boolean((await searchParams).error)} />;
      case "schedule":
        return (
          <>
            <Hero
              eyebrow="The race calendar"
              title="Chase the next green."
              description="Published league schedules. All displayed times use America/Chicago."
            />
            <section className="shell section">
              <SetupNotice />
              <RaceList races={await rows("rc_races", {}, "starts_at")} />
            </section>
          </>
        );
    }
  }
  if (path[0] === "imports" && path.length === 2)
    return path[1] === "new" ? <NewImport /> : <ImportPreview id={path[1]} />;
  if (
    path[0] === "leagues" &&
    (path.length === 2 || (path.length === 3 && path[2] === "manage"))
  )
    return <League id={path[1]} manage={path[2] === "manage"} />;
  if (path[0] === "series" && path.length === 2) return <Series id={path[1]} />;
  if (
    path[0] === "seasons" &&
    (path.length === 2 ||
      (path.length === 3 && ["standings", "rules"].includes(path[2])))
  )
    return <Season id={path[1]} section={path[2]} />;
  if (path[0] === "races" && path.length === 2) return <Race id={path[1]} />;
  if (path[0] === "drivers" && path.length === 2)
    return <Driver id={path[1]} />;
  if (path[0] === "teams" && path.length === 2) return <Team id={path[1]} />;
  notFound();
}
