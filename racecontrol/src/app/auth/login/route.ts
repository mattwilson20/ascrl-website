import { NextResponse } from "next/server";
import { database, siteURL, configured } from "@/lib/supabase";
export async function GET() {
  if (!configured()) return NextResponse.redirect(new URL("/setup", siteURL()));
  const db = await database();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: new URL("/auth/callback", siteURL()).href,
      scopes: "identify email",
    },
  });
  if (error || !data.url)
    return NextResponse.redirect(new URL("/login?error=oauth", siteURL()));
  return NextResponse.redirect(data.url);
}
