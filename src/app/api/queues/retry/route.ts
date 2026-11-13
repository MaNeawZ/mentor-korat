import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser, check, checkOrigin, errorResponse } from "@/lib/api";
import { sessionClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await apiUser("settings.manage");
    const { queue, job_id } = z
      .object({
        queue: z.enum(["line", "discord"]),
        job_id: z.string().min(1).max(200),
      })
      .parse(await request.json());
    const db = await sessionClient();
    check(await db.rpc("requeue_failed", { queue, job_id }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
