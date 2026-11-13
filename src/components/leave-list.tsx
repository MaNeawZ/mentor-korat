import Link from "next/link";
import { listLeaves, referenceData, type Filters } from "@/lib/repository";
import { statusLabels, statuses } from "@/lib/domain";
import { LeaveTable, Pagination } from "./leave-table";
import { PageHeader } from "./page-header";
import { SearchInput } from "./search";
export async function LeaveList({
  filters,
  path,
  title,
  description,
  fixed,
}: {
  filters: Filters;
  path: string;
  title: string;
  description: string;
  fixed?: string;
}) {
  const [result, refs] = await Promise.all([
    listLeaves(filters, fixed),
    referenceData(),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="LEAVE MANAGEMENT"
        title={title}
        description={description}
      />
      {path === "/mentor/tasks" && (
        <div className="tabs">
          {[
            "WAITING_EVIDENCE",
            "WAITING_MENTOR_REVIEW",
            "REUPLOAD_REQUIRED",
            "WAITING_FINAL_REVIEW",
          ].map((s) => (
            <Link
              className={filters.status === s ? "selected" : ""}
              href={`${path}?status=${s}`}
              key={s}
            >
              {statusLabels[s as keyof typeof statusLabels]}
            </Link>
          ))}
        </div>
      )}
      <section className="panel">
        <form className="filters" action={path}>
          <SearchInput value={filters.q} />
          {!fixed && (
            <select
              aria-label="สถานะ"
              name="status"
              defaultValue={filters.status || ""}
            >
              <option value="">ทุกสถานะ</option>
              {statuses.map((s) => (
                <option value={s} key={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          )}
          <select
            name="department"
            aria-label="แผนก"
            defaultValue={filters.department || ""}
          >
            <option value="">ทุกแผนก</option>
            {refs.departments.map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {refs.mentors.length > 1 && (
            <select
              name="mentor"
              aria-label="Mentor"
              defaultValue={filters.mentor || ""}
            >
              <option value="">Mentor ทุกคน</option>
              {refs.mentors.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <label className="date-filter">
            ตั้งแต่
            <input type="date" name="from" defaultValue={filters.from} />
          </label>
          <label className="date-filter">
            ถึง
            <input type="date" name="to" defaultValue={filters.to} />
          </label>
          <select
            name="sort"
            aria-label="เรียงตาม"
            defaultValue={filters.sort || "created_at"}
          >
            <option value="created_at">วันที่รับรายการ</option>
            <option value="leave_date">วันที่ลา</option>
            <option value="document_number">เลขที่ใบลา</option>
          </select>
          <select
            name="order"
            aria-label="ลำดับ"
            defaultValue={filters.order || "desc"}
          >
            <option value="desc">ใหม่ไปเก่า</option>
            <option value="asc">เก่าไปใหม่</option>
          </select>
          {filters.unassigned && (
            <input type="hidden" name="unassigned" value="1" />
          )}
          <button className="btn btn-primary">ค้นหา</button>
          <Link href={path} className="btn btn-ghost">
            ล้างตัวกรอง
          </Link>
        </form>
        <div className="list-caption">
          <strong>รายการใบลา</strong>
          <span className="count-pill">{result.count} รายการ</span>
        </div>
        <LeaveTable rows={result.rows} mentors={refs.mentors} />
        <Pagination
          page={result.page}
          count={result.count}
          filters={filters}
          path={path}
        />
      </section>
    </>
  );
}
