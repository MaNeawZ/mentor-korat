import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/domain";
import { check } from "@/lib/api";
import { sessionClient } from "@/lib/supabase/server";
import { orgChartPermissions, type OrgData } from "@/lib/org-chart";
import { OrgChart } from "@/components/org-chart";
import { PageHeader } from "@/components/page-header";

export default async function OrgChartPage() {
  const user = await requireUser();
  if (!orgChartPermissions.some((permission) => can(user, permission)))
    redirect("/dashboard?error=forbidden");
  const db = await sessionClient();
  const result = await db.rpc("org_chart");
  if (result.error?.code === "PGRST202")
    return (
      <>
        <PageHeader
          title="โครงสร้างทีม"
          description="หัวหน้าศูนย์และ HR → Mentor → พนักงาน"
        />
        <div className="panel empty-state" role="status">
          <h2>ยังไม่ได้ติดตั้งข้อมูลสำหรับ Org chart</h2>
          <p>
            กรุณารัน migration 202611190004_org_chart.sql ใน Supabase SQL Editor
            แล้วโหลดหน้านี้ใหม่
          </p>
        </div>
      </>
    );
  check(result);
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE & ORGANIZATION"
        title="โครงสร้างทีม"
        description="เห็นผู้ดูแลและสมาชิกในทีม ตั้งแต่หัวหน้าศูนย์และ HR ถึงพนักงานแต่ละคน"
      >
        {can(user, "mentors.assign") && (
          <Link href="/employees" className="btn btn-primary">
            มอบหมาย Mentor
          </Link>
        )}
      </PageHeader>
      <OrgChart data={result.data as OrgData} />
    </>
  );
}
