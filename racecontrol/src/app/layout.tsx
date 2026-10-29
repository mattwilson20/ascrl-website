import type { Metadata } from "next";
import Link from "next/link";
import { account, configured } from "@/lib/supabase";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "ASCRL Race Control", template: "%s | ASCRL Race Control" },
  description:
    "League management, race classification, and championship scoring for the American Stock Car Racing League.",
};
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await account();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <div className="masthead">
          <span>AMERICAN STOCK CAR RACING LEAGUE</span>
          <a href="https://www.ascrl.online/">ASCRL.ONLINE ↗</a>
        </div>
        <header className="site-header">
          <Link href="/" className="brand">
            <img
              src="/brand/wordmark.webp"
              alt="ASCRL"
              width="144"
              height="58"
            />
            <span>
              RACE <b>CONTROL</b>
            </span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/leagues">Leagues</Link>
            <Link href="/schedule">Schedule</Link>
            <Link href="/admin">Control room</Link>
            <Link href="/imports/new" className="nav-import">
              Import results ↗
            </Link>
          </nav>
          <div className="account-nav">
            {user ? (
              <>
                <Link href="/settings">My account</Link>
                <form method="post" action="/auth/logout">
                  <button className="text-button">Sign out</button>
                </form>
              </>
            ) : (
              <Link
                className="button small secondary"
                href={configured() ? "/login" : "/setup"}
              >
                {configured() ? "Discord sign in" : "Connect platform"}
              </Link>
            )}
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div>
            <strong>ASCRL RACE CONTROL</strong>
            <p>Every finish accounted for.</p>
          </div>
          <div>
            <Link href="/leagues">League directory</Link>
            <Link href="/settings">Account</Link>
            <Link href="/setup">Platform setup</Link>
            <a href="https://www.ascrl.online/rules.html">
              ASCRL sporting code ↗
            </a>
          </div>
          <small>
            American Stock Car Racing League · A&amp;M Productions LLC
          </small>
        </footer>
      </body>
    </html>
  );
}
