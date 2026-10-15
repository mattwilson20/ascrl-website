import { NextResponse } from "next/server";
import { database, siteURL } from "@/lib/supabase";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    const db = await database();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await db.auth.getUser();
      if (data.user) {
        const { data: profile } = await db
          .from("rc_profiles")
          .select("id")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!profile)
          await db.rpc("rc_manage", {
            command: "profile",
            p: {
              display_name: String(
                data.user.user_metadata.full_name ||
                  data.user.user_metadata.name ||
                  "ASCRL Driver",
              ).slice(0, 80),
            },
          });
      }
      return NextResponse.redirect(new URL("/admin", siteURL()));
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", siteURL()));
}
