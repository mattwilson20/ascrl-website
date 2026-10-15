import Link from "next/link";
export default function NotFound() {
  return (
    <section className="shell section">
      <p className="eyebrow">404 / Race Control</p>
      <h1>Off the racing line.</h1>
      <p>
        This record is unavailable or you do not have permission to view it.
      </p>
      <Link className="button" href="/leagues">
        Return to leagues
      </Link>
    </section>
  );
}
