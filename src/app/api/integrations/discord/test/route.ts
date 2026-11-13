import { NextResponse } from "next/server";
import {
  apiUser,
  checkOrigin,
  errorResponse,
  HttpError,
  limited,
} from "@/lib/api";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await apiUser("settings.manage");
    await limited(`discord-test:${user.id}`, 2, 60);
    if (!process.env.DISCORD_WEBHOOK_URL)
      throw new HttpError(503, "ยังไม่ได้ตั้งค่า Discord");
    const url = new URL(process.env.DISCORD_WEBHOOK_URL);
    if (
      url.hostname !== "discord.com" ||
      !url.pathname.startsWith("/api/webhooks/")
    )
      throw new HttpError(400, "Discord URL ไม่ถูกต้อง");
    url.searchParams.set("wait", "true");
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "✅ Korat Leave Monitoring เชื่อมต่อสำเร็จ",
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new HttpError(502, "Discord ไม่ตอบรับ กรุณาตรวจสอบการตั้งค่า");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
