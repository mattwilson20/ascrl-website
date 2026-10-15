"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="shell section">
      <p className="eyebrow">Race Control</p>
      <h1>Unable to load this page.</h1>
      <p>Check the database connection and migrations, then try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
      <a className="button secondary" href="/setup">
        Setup guide
      </a>
    </section>
  );
}
