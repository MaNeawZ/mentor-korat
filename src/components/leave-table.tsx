import Link from "next/link";
import {
  ArrowUpRight,
  FileSearch,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { StatusBadge } from "./status";
import type { Leave } from "@/lib/domain";
import { thaiDate } from "@/lib/utils";
export function LeaveTable({
  rows,
  mentors = [],
}: {
  rows: Leave[];
  mentors?: { id: string; name: string }[];
}) {
  if (!rows.length)
    return (
      <div className="empty-state">
        <FileSearch size={36} />
        <h3>ยังไม่มีใบลาในรายการนี้</h3>
        <p>ใบลาจาก LINE จะแสดงที่นี่ หรือปรับตัวกรองเพื่อค้นหารายการอื่น</p>
      </div>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>พนักงาน</th>
            <th>เลขที่ใบลา</th>
            <th>ประเภท / วันที่ลา</th>
            <th>Mentor</th>
            <th>สถานะ</th>
            <th>
              <span className="sr-only">รายละเอียด</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>
                <Link href={`/leaves/${l.id}`} className="employee-cell">
                  <span className="avatar neutral">
                    {l.employees?.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{l.employees?.name || "—"}</strong>
                    <small>
                      {l.employees?.code} · {l.employees?.departments?.name}
                    </small>
                  </span>
                </Link>
              </td>
              <td>
                <span className="mono">{l.document_number}</span>
                <small>รับเมื่อ {thaiDate(l.created_at)}</small>
              </td>
              <td>
                <strong className="normal-weight">
                  {l.leave_type}{" "}
                  <span className="muted">
                    {l.period === "AM"
                      ? "ช่วงเช้า"
                      : l.period === "PM"
                        ? "ช่วงบ่าย"
                        : "เต็มวัน"}
                  </span>
                </strong>
                <small>{thaiDate(l.leave_date)}</small>
              </td>
              <td>
                {l.mentor_id ? (
                  <span>
                    {mentors.find((m) => m.id === l.mentor_id)?.name ||
                      "มอบหมายแล้ว"}
                  </span>
                ) : (
                  <span className="unassigned-tag">ยังไม่มอบหมาย</span>
                )}
              </td>
              <td>
                <StatusBadge status={l.status} />
              </td>
              <td>
                <Link
                  className="icon-btn"
                  aria-label={`เปิดใบลา ${l.document_number}`}
                  href={`/leaves/${l.id}`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({
  page,
  count,
  filters = {},
  path,
}: {
  page: number;
  count: number;
  filters?: Record<string, string | undefined>;
  path: string;
}) {
  const pages = Math.max(1, Math.ceil(count / 20));
  function url(p: number) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) query.set(k, v);
    });
    query.set("page", String(p));
    return `${path}?${query}`;
  }
  return (
    <div className="pagination">
      <span>
        {count
          ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, count)} จาก ${count} รายการ`
          : "0 รายการ"}
      </span>
      <div className="row">
        {page > 1 && (
          <Link className="btn btn-outline" href={url(page - 1)}>
            <ChevronLeft size={16} />
            ก่อนหน้า
          </Link>
        )}
        <span>
          หน้า {page} / {pages}
        </span>
        {page < pages && (
          <Link className="btn btn-outline" href={url(page + 1)}>
            ถัดไป
            <ChevronRight size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
