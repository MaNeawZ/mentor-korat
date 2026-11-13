import { ShieldCheck, Sprout } from "lucide-react";
import { uploadContext } from "@/lib/evidence";
import { HttpError } from "@/lib/api";
import { thaiDate } from "@/lib/utils";
import { UploadForm } from "@/components/upload-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "ส่งหลักฐานการลา", referrer: "no-referrer" };
export default async function Upload({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let context;
  try {
    context = await uploadContext(token);
  } catch (e) {
    return (
      <main className="public-card">
        <ShieldCheck size={40} />
        <h1>ตรวจสอบลิงก์อัปโหลด</h1>
        <p>
          {e instanceof HttpError
            ? e.message
            : "ยังไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่ภายหลัง"}
        </p>
      </main>
    );
  }
  return (
    <main className="upload-page">
      <div className="brand">
        <span className="brand-mark">
          <Sprout />
        </span>
        <span>
          KORAT<span className="brand-sub">LEAVE MONITORING</span>
        </span>
      </div>
      <section className="upload-card">
        <span className="eyebrow">EVIDENCE UPLOAD</span>
        <h1>ส่งหลักฐานการลา</h1>
        <p>
          สวัสดี คุณ{" "}
          {context.employees?.[0]?.name ||
            (context.employees as unknown as { name?: string })?.name}
        </p>
        <dl className="upload-info">
          <div>
            <dt>เลขที่ใบลา</dt>
            <dd>{context.document_number}</dd>
          </div>
          <div>
            <dt>วันที่ลา</dt>
            <dd>{thaiDate(context.leave_date)}</dd>
          </div>
          <div>
            <dt>ประเภทการลา</dt>
            <dd>{context.leave_type}</dd>
          </div>
        </dl>
        <UploadForm token={token} />
      </section>
      <small>
        <ShieldCheck size={14} /> ข้อมูลของคุณได้รับการดูแลอย่างปลอดภัย
      </small>
    </main>
  );
}
