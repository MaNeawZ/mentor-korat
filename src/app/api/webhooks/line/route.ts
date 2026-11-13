import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyLineSignature } from "@/lib/security";
import { adminClient } from "@/lib/supabase/server";
import { check, errorResponse, HttpError } from "@/lib/api";
import { limitedBody } from "@/lib/body";
import { wakeWorker } from "@/lib/worker-wakeup";
export const maxDuration = 300;
const eventSchema = z
  .object({
    webhookEventId: z.string().min(1).max(200),
    type: z.string(),
    source: z.object({ type: z.string(), groupId: z.string().optional() }),
    message: z
      .object({
        type: z.string(),
        id: z.string(),
        text: z.string().max(10000).optional(),
      })
      .optional(),
  })
  .passthrough();
export async function POST(request: Request) {
  try {
    if (!process.env.LINE_CHANNEL_SECRET)
      throw new HttpError(503, "Integration not configured");
    const raw = new TextDecoder().decode(
      await limitedBody(request, 1024 * 1024),
    );
    if (
      !verifyLineSignature(
        raw,
        request.headers.get("x-line-signature") || "",
        process.env.LINE_CHANNEL_SECRET,
      )
    )
      throw new HttpError(401, "Invalid signature");
    const { events } = z
      .object({ events: z.array(eventSchema).max(100) })
      .parse(JSON.parse(raw));
    const db = adminClient();
    const discovered = [
      ...new Set(
        events
          .filter(
            (e) =>
              e.source.type === "group" &&
              /^C[0-9a-f]{32}$/i.test(e.source.groupId || ""),
          )
          .map((e) => e.source.groupId!),
      ),
    ];
    if (discovered.length)
      check(
        await db.from("line_groups").upsert(
          discovered.map((id) => ({ id, name: "กลุ่มที่รอยืนยัน", active: false })),
          { onConflict: "id", ignoreDuplicates: true },
        ),
      );
    const groups = await db.from("line_groups").select("id").eq("active", true);
    check(groups);
    const allowed = new Set(groups.data?.map((x) => x.id));
    const rows = events
      .filter(
        (e) =>
          e.type === "message" &&
          e.message?.type === "text" &&
          e.source.type === "group" &&
          allowed.has(e.source.groupId),
      )
      .map((e) => ({ id: e.webhookEventId, payload: e }));
    if (rows.length) {
      check(
        await db
          .from("integration_events")
          .upsert(rows, { onConflict: "id", ignoreDuplicates: true }),
      );
      wakeWorker();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
