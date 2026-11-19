import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/domain";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { referenceData, type Filters } from "@/lib/repository";
import { EmployeeManager } from "./employee-manager";
import { EmployeeImport } from "./employee-import";
import { EntityForm } from "./entity-form";
import { PageHeader } from "./page-header";
import { SearchInput } from "./search";
import { Pagination } from "./leave-table";
export async function EmployeePage({
  filters,
  unassigned = false,
}: {
  filters: Filters;
  unassigned?: boolean;
}) {
  const user = await requireUser(unassigned ? "mentors.assign" : undefined);
  const db = await sessionClient(),
    refs = await referenceData();
  const page = Math.max(1, Number(filters.page) || 1);
  let q = db
    .from("employees")
    .select("id,code,name,department_id,mentor_id,active,departments(name)", {
      count: "exact",
    });
  if (unassigned) q = q.is("mentor_id", null);
  const term = filters.q?.replace(/[^\p{L}\p{N}\s-]/gu, "").slice(0, 80);
  if (term) q = q.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
  if (filters.department && /^[0-9a-f-]{36}$/.test(filters.department))
    q = q.eq("department_id", filters.department);
  const result = await q.order("code").range((page - 1) * 20, page * 20 - 1);
  check(result);
  const path = unassigned ? "/assignments/unassigned" : "/employees";
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE & RESPONSIBILITY"
        title={unassigned ? "พนักงานรอมอบหมาย Mentor" : "พนักงาน"}
        description="จัดการข้อมูลทีม และเชื่อมต่อพนักงานกับ Mentor ผู้รับผิดชอบ"
      >
        {can(user, "employees.manage") && (
          <EmployeeImport departments={refs.departments} />
        )}
        {can(user, "employees.manage") && (
          <EntityForm
            title="เพิ่มแผนก"
            endpoint="/api/manage/department"
            fields={[{ key: "name", label: "ชื่อแผนก", required: true }]}
          />
        )}
      </PageHeader>
      <div className="tabs">
        <Link href="/employees" className={!unassigned ? "selected" : ""}>
          พนักงานทั้งหมด
        </Link>
        {can(user, "mentors.assign") && (
          <Link
            href="/assignments/unassigned"
            className={unassigned ? "selected" : ""}
          >
            รอมอบหมาย Mentor
          </Link>
        )}
      </div>
      <section className="panel">
        <form className="filters" action={path}>
          <SearchInput value={filters.q} placeholder="ค้นหาชื่อหรือรหัสพนักงาน" />
          <select
            name="department"
            defaultValue={filters.department || ""}
            aria-label="แผนก"
          >
            <option value="">ทุกแผนก</option>
            {refs.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button className="btn btn-outline">ค้นหา</button>
        </form>
        <EmployeeManager
          key={JSON.stringify(result.data)}
          employees={
            result.data as unknown as Parameters<
              typeof EmployeeManager
            >[0]["employees"]
          }
          departments={refs.departments}
          mentors={refs.mentors.filter((m) => m.active)}
          manage={can(user, "employees.manage")}
          assign={can(user, "mentors.assign")}
        />
        <Pagination
          page={page}
          count={result.count || 0}
          path={path}
          filters={filters}
        />
      </section>
    </>
  );
}
