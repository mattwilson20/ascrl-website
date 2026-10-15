import { NextResponse } from "next/server";
import { authorize, fail } from "@/lib/http";
import { siteURL } from "@/lib/supabase";
export async function POST(request: Request) {
  try {
    const db = await authorize(request);
    await db.auth.signOut();
    return NextResponse.redirect(new URL("/", siteURL()), 303);
  } catch (e) {
    return fail(e);
  }
}
