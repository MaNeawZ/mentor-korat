import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiUser,
  check,
  checkOrigin,
  errorResponse,
  HttpError,
} from "@/lib/api";
import { employeeSchema, permissions, type Permission } from "@/lib/domain";
import { sessionClient } from "@/lib/supabase/server";
const schemas = {
  employee: employeeSchema,
  assignment: z.object({
    employee_ids: z.array(z.uuid()).min(1).max(200),
    mentor_id: z.uuid().nullable(),
  }),
  user: z.object({
    id: z.uuid(),
    name: z.string().trim().min(2).max(160),
    role: z.enum(["CENTER_HEAD", "HR", "MENTOR"]),
    active: z.boolean(),
    discord_user_id: z
      .string()
      .regex(/^\d{15,22}$/)
      .or(z.literal("")),
  }),
  permission: z.object({
    user_id: z.uuid(),
    permission: z.enum(permissions),
    allowed: z.boolean(),
  }),
  department: z.object({ name: z.string().trim().min(1).max(80) }),
  line_group: z.object({
    id: z.string().regex(/^C[0-9a-f]{32}$/i),
    name: z.string().trim().min(1).max(100),
    active: z.boolean(),
  }),
  setting: z.discriminatedUnion("key", [
    z.object({
      key: z.literal("leave_types"),
      value: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
    }),
    z.object({
      key: z.literal("retention_days"),
      value: z.number().int().min(30).max(3650),
    }),
    z.object({
      key: z.literal("discord_mode"),
      value: z.enum(["edit", "events"]),
    }),
  ]),
};
const required: Record<string, Permission> = {
  employee: "employees.manage",
  assignment: "mentors.assign",
  user: "users.manage",
  permission: "permissions.manage",
  department: "employees.manage",
  line_group: "settings.manage",
  setting: "settings.manage",
};
export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    checkOrigin(request);
    const { kind } = await params;
    if (!(kind in schemas)) throw new HttpError(404, "ไม่พบรายการ");
    await apiUser(required[kind]);
    const payload = schemas[kind as keyof typeof schemas].parse(
      await request.json(),
    );
    const db = await sessionClient();
    check(await db.rpc("manage_entity", { kind, payload }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
