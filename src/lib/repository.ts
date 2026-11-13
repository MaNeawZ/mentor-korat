import "server-only";
import { sessionClient } from "./supabase/server";
import { check } from "./api";
import { statuses, type Leave } from "./domain";
export type Filters = Record<string, string | undefined>;
export async function listLeaves(filters: Filters = {}, fixed?: string) {
  const db = await sessionClient();
  const page = Math.min(10000, Math.max(1, Number(filters.page) || 1));
  let q = db
    .from("leave_requests")
    .select(
      "id,document_number,employee_id,mentor_id,assignment_status,status,leave_type,leave_date,period,reason,version,created_at,employees!inner(code,name,departments(name))",
      { count: "exact" },
    );
  const term = filters.q?.replace(/[^\p{L}\p{N}\s-]/gu, "").slice(0, 80);
  if (term) {
    const employee = await db
      .from("employees")
      .select("id")
      .or(`name.ilike.%${term}%,code.ilike.%${term}%`)
      .limit(200);
    check(employee);
    q = q.or(
      `document_number.ilike.%${term}%,employee_id.in.(${employee.data?.map((e) => e.id).join(",") || "00000000-0000-0000-0000-000000000000"})`,
    );
  }
  const state = fixed || filters.status;
  if (state && statuses.includes(state as (typeof statuses)[number]))
    q = q.eq("status", state);
  if (filters.unassigned === "1") q = q.is("mentor_id", null);
  if (filters.mentor && /^[0-9a-f-]{36}$/.test(filters.mentor))
    q = q.eq("mentor_id", filters.mentor);
  if (filters.department && /^[0-9a-f-]{36}$/.test(filters.department))
    q = q.eq("employees.department_id", filters.department);
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from))
    q = q.gte("leave_date", filters.from);
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to))
    q = q.lte("leave_date", filters.to);
  const order = ["leave_date", "document_number", "created_at"].includes(
    filters.sort || "",
  )
    ? filters.sort!
    : "created_at";
  const result = await q
    .order(order, { ascending: filters.order === "asc" })
    .range((page - 1) * 20, page * 20 - 1);
  check(result);
  return {
    rows: (result.data || []) as unknown as Leave[],
    count: result.count || 0,
    page,
  };
}
export async function referenceData() {
  const db = await sessionClient();
  const [departments, mentors] = await Promise.all([
    db.from("departments").select("id,name").order("name"),
    db
      .from("app_users")
      .select("id,name,active,discord_user_id,role")
      .eq("role", "MENTOR")
      .order("name"),
  ]);
  check(departments);
  check(mentors);
  return { departments: departments.data || [], mentors: mentors.data || [] };
}
