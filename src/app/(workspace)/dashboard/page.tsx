import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Files,
  Clock,
  UserRoundCheck,
  CheckCheck,
  UserPlus,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { listLeaves, referenceData } from "@/lib/repository";
import { statuses, statusLabels } from "@/lib/domain";
import { LeaveTable } from "@/components/leave-table";
import { PageHeader } from "@/components/page-header";
export default async function Dashboard() {
  const user = await requireUser();
  const db = await sessionClient();
  const [counts, leaves, refs] = await Promise.all([
    db.rpc("dashboard_counts"),
    listLeaves(),
    referenceData(),
  ]);
  check(counts);
  const c = counts.data as {
    total: number;
    unassigned: number;
    statuses: Record<string, number>;
  };
  const pending =
    (c.statuses.WAITING_MENTOR_REVIEW || 0) +
    (c.statuses.WAITING_FINAL_REVIEW || 0);
  const cards = [
    {
      title: "ใบลาทั้งหมด",
      value: c.total,
      icon: Files,
      note: "รายการในความดูแล",
      color: "indigo",
      href: "/leaves",
    },
    {
      title: "รออัปโหลดหลักฐาน",
      value: c.statuses.WAITING_EVIDENCE || 0,
      icon: Clock,
      note: "ติดตามหลักฐานจากพนักงาน",
      color: "amber",
      href: "/leaves?status=WAITING_EVIDENCE",
    },
    {
      title: "รอการตรวจสอบ",
      value: pending,
      icon: UserRoundCheck,
      note: "Mentor และผู้ตรวจขั้นสุดท้าย",
      color: "violet",
      href: "/mentor/tasks",
    },
    {
      title: "ตรวจสอบเรียบร้อย",
      value: c.statuses.VERIFIED || 0,
      icon: CheckCheck,
      note: "ดำเนินการตรวจหลักฐานแล้ว",
      color: "green",
      href: "/leaves?status=VERIFIED",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE OVERVIEW"
        title={`สวัสดี, ${user.name.split(" ")[0]} 👋`}
        description="ภาพรวมการลาและรายการที่ต้องดูแลของทีมศูนย์โคราช"
      >
        <Link className="btn btn-outline" href="/leaves">
          ดูใบลาทั้งหมด
          <ArrowUpRight size={16} />
        </Link>
      </PageHeader>
      <section className="overview-banner">
        <div>
          <span className="banner-label">
            <span className="online-dot" /> KORAT TEAM WORKSPACE
          </span>
          <h2>
            ดูแลทีมอย่างใส่ใจ
            <br />
            <span>ทุกขั้นตอนอยู่ในสายตาคุณ</span>
          </h2>
          <p>ติดตามใบลา ตรวจสอบหลักฐาน และส่งต่องานได้ในที่เดียว</p>
          <Link href="/mentor/tasks">
            ไปที่รายการที่ต้องดำเนินการ <ArrowRight size={16} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="art-ring" />
          <div className="art-document">
            <div className="row">
              <div className="art-icon">
                <ShieldCheck size={29} />
              </div>
              <span>
                Leave monitoring
                <br />
                <strong>ดูแลอย่างเป็นระบบ</strong>
              </span>
            </div>
            <div className="art-line" />
            <div className="art-line short" />
            <div className="art-check">
              <CheckCheck size={16} /> พร้อมส่งต่อการดูแล
            </div>
          </div>
          <span className="floating-spark">✦</span>
        </div>
      </section>
      <section className="stat-grid">
        {cards.map((card) => (
          <Link
            className={`stat-card accent-${card.color}`}
            key={card.title}
            href={card.href}
          >
            <div className="row between">
              <span>{card.title}</span>
              <div className="stat-icon">
                <card.icon size={20} />
              </div>
            </div>
            <strong className="stat-value">
              {card.value.toLocaleString("th-TH")}
            </strong>
            <small>
              {card.note}
              <ArrowUpRight size={14} />
            </small>
          </Link>
        ))}
      </section>
      <section className="dashboard-middle">
        <div className="panel workflow-panel">
          <div className="panel-header">
            <div>
              <h2>สถานะการตรวจสอบ</h2>
              <p>ติดตามความคืบหน้าทุกขั้นตอน</p>
            </div>
            <Activity size={19} className="muted" />
          </div>
          <div className="status-breakdown">
            {statuses.map((s) => (
              <Link
                href={`/leaves?status=${s}`}
                className="status-progress"
                key={s}
              >
                <div className="row between">
                  <span>
                    <i className={`status-dot status-${s}`} />
                    {statusLabels[s]}
                  </span>
                  <b>{c.statuses[s] || 0}</b>
                </div>
                <div className="progress-track">
                  <div
                    className={`status-${s}`}
                    style={{
                      width: `${c.total ? Math.max(2, ((c.statuses[s] || 0) / c.total) * 100) : 0}%`,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="panel action-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">YOUR NEXT STEPS</span>
              <h2>รายการที่ต้องดูแล</h2>
            </div>
            <span className="count-pill">{pending + c.unassigned}</span>
          </div>
          <Link href="/mentor/tasks" className="action-item">
            <div className="action-icon violet">
              <UserRoundCheck size={21} />
            </div>
            <div>
              <strong>รอตรวจสอบหลักฐาน</strong>
              <small>ตรวจสอบและส่งต่อให้ผู้รับผิดชอบ</small>
            </div>
            <b>{pending}</b>
            <ArrowRight size={17} />
          </Link>
          <Link href="/leaves?unassigned=1" className="action-item">
            <div className="action-icon amber">
              <UserPlus size={21} />
            </div>
            <div>
              <strong>ใบลาที่ยังไม่มี Mentor</strong>
              <small>มอบหมายผู้ดูแลเพื่อเริ่มดำเนินการ</small>
            </div>
            <b>{c.unassigned}</b>
            <ArrowRight size={17} />
          </Link>
          <div className="info-note">
            <ShieldCheck size={20} />
            <p>
              “ตรวจสอบแล้ว” หมายถึงตรวจหลักฐานเรียบร้อย
              <br />
              การอนุมัติวันลาเป็นไปตามระบบ HR ขององค์กร
            </p>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>ใบลาล่าสุด</h2>
            <p>อัปเดตข้อมูลรายการล่าสุดของทีม</p>
          </div>
          <Link className="text-link" href="/leaves">
            ดูทั้งหมด <ArrowRight size={15} />
          </Link>
        </div>
        <LeaveTable rows={leaves.rows.slice(0, 6)} mentors={refs.mentors} />
      </section>
    </>
  );
}
