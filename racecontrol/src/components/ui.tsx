import Link from "next/link";
import { configured } from "@/lib/supabase";
import type { Column } from "./data-table";
export function Hero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="page-hero">
      <div className="shell">
        <p className="eyebrow">
          <i />
          {eyebrow}
        </p>
        <h1>{title}</h1>
        {description && <p className="lede">{description}</p>}
        {actions && <div className="actions">{actions}</div>}
      </div>
      <span className="hero-watermark" aria-hidden>
        RC
      </span>
    </section>
  );
}
export function Panel({
  title,
  children,
  id,
}: {
  title?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="panel" id={id}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function Empty({
  title = "No records yet.",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden>
        ↗
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function SetupNotice() {
  return !configured() ? (
    <div className="notice">
      <strong>Platform connection required.</strong> Add the Supabase
      environment variables and apply the database migrations to enable sign-in
      and league records. <Link href="/setup">View setup steps →</Link>
    </div>
  ) : null;
}
export function StatStrip({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <div className="stat-strip">
      {items.map((i) => (
        <div key={i.label}>
          <strong>{i.value}</strong>
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  );
}
export function Card({
  kicker,
  title,
  description,
  href,
  footer,
}: {
  kicker: string;
  title: string;
  description?: string;
  href: string;
  footer?: string;
}) {
  return (
    <Link href={href} className="link-card">
      <p className="eyebrow">{kicker}</p>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      <span>
        {footer || "Open dashboard"} <b>↗</b>
      </span>
    </Link>
  );
}
export const date = (v: string) =>
  new Date(v).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
export const standingColumns: Column[] = [
  { key: "championship_position", label: "Pos" },
  {
    key: "racing_name",
    label: "Driver",
    href: "/drivers/",
    idKey: "driver_id",
  },
  { key: "car_number", label: "#" },
  { key: "team_name", label: "Team", href: "/teams/", idKey: "team_id" },
  { key: "starts", label: "Starts" },
  { key: "wins", label: "Wins" },
  { key: "top5", label: "Top 5" },
  { key: "top10", label: "Top 10" },
  { key: "poles", label: "Poles" },
  { key: "average_finish", label: "Avg finish" },
  { key: "stage_points", label: "Stage" },
  { key: "bonus_points", label: "Bonus" },
  { key: "penalty_points", label: "Penalty" },
  { key: "total_points", label: "Points" },
  { key: "gap", label: "Gap" },
];
export const teamColumns: Column[] = [
  { key: "championship_position", label: "Pos" },
  { key: "team_name", label: "Team", href: "/teams/", idKey: "team_id" },
  { key: "starts", label: "Races" },
  { key: "wins", label: "Wins" },
  { key: "total_points", label: "Points" },
  { key: "gap", label: "Gap" },
];
