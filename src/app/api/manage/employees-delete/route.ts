import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiUser,
  check,
  checkOrigin,
  errorResponse,
  HttpError,
} from "@/lib/api";
import { limitedBody } from "@/lib/body";
import { sessionClient } from "@/lib/supabase/server";

const schema = z.object({ employee_ids: z.array(z.uuid()).min(1).max(200) });
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await apiUser("employees.manage");
    const payload = schema.parse(
      JSON.parse(new TextDecoder().decode(await limitedBody(request, 16384))),
    );
    const db = await sessionClient();
    const result = await db.rpc("delete_employees", {
      employee_ids: [...new Set(payload.employee_ids)],
    });
    if (result.error?.code === "PGRST202")
      throw new HttpError(
        503,
        "ยังไม่ได้ติดตั้งฟังก์ชันลบพนักงาน กรุณารัน migration 202611190002_delete_employees.sql ใน Supabase SQL Editor แล้วลองใหม่ (EMPLOYEE_DELETE_NOT_INSTALLED)",
      );
    if (
      result.error &&
      /EMPLOYEE_HAS_LEAVES|foreign key constraint/.test(result.error.message)
    ) {
      const codes = result.error.message.match(
        /^EMPLOYEE_HAS_LEAVES:([A-Z0-9, ]+)$/,
      )?.[1];
      throw new HttpError(
        409,
        `ยังไม่ได้ลบพนักงาน: ${codes ? `รหัส ${codes} มีประวัติใบลา` : "มีพนักงานที่มีประวัติใบลาอยู่ในชุดที่เลือก"} กรุณาเอาคนนั้นออกจากรายการที่เลือก หรือปิดใช้งานผ่านปุ่มแก้ไข`,
      );
    }
    check(result);
    return NextResponse.json(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
