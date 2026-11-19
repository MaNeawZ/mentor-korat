import Link from "next/link";
import { Users, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
export default async function Mentors() {
  await requireUser("mentors.assign");
  const db = await sessionClient();
  const result = await db.rpc("mentor_counts");
  check(result);
  const data = result.data as {
    id: string;
    name: string;
    active: boolean;
    employee_count: number;
  }[];
  return (
    <>
      <PageHeader
        eyebrow="MENTOR MANAGEMENT"
        title="Mentor และการมอบหมาย"
        description="กระจายการดูแลให้เหมาะสม และติดตามจำนวนพนักงานในความรับผิดชอบ"
      >
        <Link className="btn btn-outline" href="/org-chart">
          ดู Org chart
        </Link>
        <Link className="btn btn-primary" href="/employees">
          มอบหมายพนักงาน
          <ArrowUpRight size={16} />
        </Link>
        <Link className="btn btn-outline" href="/settings/users">
          จัดการบัญชี Mentor
        </Link>
      </PageHeader>
      <div className="mentor-grid">
        {data.map((m) => (
          <article className="panel mentor-card" key={m.id}>
            <div className="row between">
              <span className="avatar large">{m.name.slice(0, 1)}</span>
              <span
                className={`badge ${m.active ? "status-VERIFIED" : "status-REJECTED"}`}
              >
                <i />
                {m.active ? "ใช้งาน" : "ปิดใช้งาน"}
              </span>
            </div>
            <h2>{m.name}</h2>
            <p className="muted">Mentor · ศูนย์โคราช</p>
            <div className="mentor-count">
              <Users size={21} />
              <strong>{m.employee_count}</strong>พนักงานในความดูแล
            </div>
            <Link className="text-link" href={`/leaves?mentor=${m.id}`}>
              ดูรายการใบลา
              <ArrowUpRight size={16} />
            </Link>
          </article>
        ))}
      </div>
      {data.length === 0 && (
        <div className="panel empty-state">
          <h3>ยังไม่มี Mentor</h3>
          <p>เพิ่มบัญชีผู้ใช้งานและกำหนดบทบาท Mentor เพื่อเริ่มมอบหมาย</p>
          <Link href="/settings/users" className="text-link">
            จัดการบัญชีผู้ใช้ →
          </Link>
        </div>
      )}
    </>
  );
}
