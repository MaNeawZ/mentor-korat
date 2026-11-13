import { Sprout, ShieldCheck, ArrowUpRight } from "lucide-react";
export const dynamic = "force-dynamic";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark">
            <Sprout />
          </span>
          <span>
            KORAT<span className="brand-sub">LEAVE MONITORING</span>
          </span>
        </div>
        <div className="story-copy">
          <span className="eyebrow">A BETTER WAY TO CARE FOR YOUR TEAM</span>
          <h1>
            ทุกการลา
            <br />
            ดูแลได้<span>อย่างเข้าใจ.</span>
          </h1>
          <p>
            พื้นที่เดียวสำหรับติดตามใบลา ตรวจสอบหลักฐาน
            <br />
            และเชื่อมต่อการดูแลพนักงานกับ Mentor
          </p>
          <div className="story-workflow">
            <span>01 รับข้อมูลจาก LINE</span>
            <ArrowUpRight />
            <span>02 ตรวจสอบอย่างเป็นระบบ</span>
            <ArrowUpRight />
            <span>03 ส่งต่อให้ทีมที่ดูแล</span>
          </div>
        </div>
        <div className="row muted">
          <ShieldCheck size={18} /> พื้นที่ทำงานส่วนตัวสำหรับทีมศูนย์โคราช
        </div>
        <div className="story-orb" />
      </section>
      <section className="auth-form-side">
        <div className="auth-form-card">
          {children}
          <div className="auth-note">
            <ShieldCheck size={15} /> เข้าถึงได้เฉพาะบัญชีที่ได้รับสิทธิ์จากผู้ดูแล
          </div>
        </div>
        <small className="auth-copyright">
          Korat Leave Monitoring · Mentor Management System
        </small>
      </section>
    </main>
  );
}
