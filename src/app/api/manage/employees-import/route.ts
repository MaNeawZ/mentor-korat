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
import { MAX_IMPORT_BYTES, parseEmployeeCsv } from "@/lib/employee-import";
import { sessionClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await apiUser("employees.manage");
    const departmentId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("department_id"));
    const bytes = await limitedBody(request, MAX_IMPORT_BYTES);
    let employees;
    try {
      employees = parseEmployeeCsv(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof TypeError
          ? "กรุณาบันทึกไฟล์เป็น CSV UTF-8"
          : (error as Error).message,
      );
    }
    const db = await sessionClient();
    const result = await db.rpc("import_employees", {
      department_id: departmentId,
      employees,
    });
    check(result);
    return NextResponse.json(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
