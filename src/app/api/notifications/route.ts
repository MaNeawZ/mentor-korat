import { NextResponse } from "next/server";
import { apiUser, check, checkOrigin, errorResponse } from "@/lib/api";
import { sessionClient } from "@/lib/supabase/server";
import { z } from "zod";
import { notificationSelect } from "@/lib/notifications";
export async function GET() {
  try {
    await apiUser();
    const db = await sessionClient();
    const [recent, count] = await Promise.all([
      db
        .from("notifications")
        .select(notificationSelect)
        .order("created_at", { ascending: false })
        .limit(12),
      db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
    ]);
    check(recent);
    check(count);
    return NextResponse.json(
      { items: recent.data, unread: count.count },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await apiUser();
    const { id } = z
      .object({ id: z.uuid().nullable() })
      .parse(await request.json());
    const db = await sessionClient();
    check(await db.rpc("mark_notifications", { nid: id }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
