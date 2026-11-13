import { NextResponse } from "next/server";
import { apiUser, check, errorResponse, HttpError } from "@/lib/api";
import { sessionClient, adminClient } from "@/lib/supabase/server";
import { z } from "zod";
import { readDiscordEvidence } from "@/lib/discord-evidence";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await apiUser();
    const { id } = await params;
    z.uuid().parse(id);
    const db = await sessionClient();
    const r = await db
      .from("evidence_files")
      .select(
        "path,provider,discord_webhook_id,discord_message_id,discord_attachment_id",
      )
      .eq("id", id)
      .maybeSingle();
    check(r);
    if (!r.data) throw new HttpError(404, "ไม่พบหลักฐาน");
    if (r.data.provider === "discord") {
      const data = await readDiscordEvidence(r.data);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
          "Content-Disposition": "inline",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (r.data.provider !== "supabase")
      throw new HttpError(503, "ไม่รู้จักแหล่งเก็บหลักฐาน");
    const file = await adminClient()
      .storage.from("mentor-korat-evidence")
      .download(r.data.path);
    check(file);
    return new NextResponse(file.data, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
