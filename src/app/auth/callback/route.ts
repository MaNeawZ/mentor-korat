import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await sessionClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          url.searchParams.get("next") === "/reset-password"
            ? "/reset-password"
            : "/dashboard",
          process.env.NEXT_PUBLIC_APP_URL || url.origin,
        ),
      );
  }
  return NextResponse.redirect(new URL("/login?error=expired", url.origin));
}
