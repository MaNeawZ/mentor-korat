import { NextResponse } from "next/server";
import { adminClient, configured } from "@/lib/supabase/server";
export async function GET() {
  try {
    if (
      !configured() ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      (process.env.UPLOAD_TOKEN_SECRET?.length || 0) < 32 ||
      (process.env.CRON_SECRET?.length || 0) < 32 ||
      !process.env.LINE_CHANNEL_SECRET ||
      !process.env.DISCORD_WEBHOOK_URL
    )
      return NextResponse.json({ status: "unconfigured" }, { status: 503 });
    const { error } = await adminClient()
      .from("app_settings")
      .select("key")
      .limit(1);
    return NextResponse.json(
      {
        status: error ? "unhealthy" : "ok",
        build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
        workerMode: "after-response",
      },
      { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }
}
