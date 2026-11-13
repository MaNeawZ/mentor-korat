"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  CheckCheck,
  RefreshCw,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { can, type Profile, type Status } from "@/lib/domain";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
export function ReviewActions({
  id,
  version,
  status,
  user,
}: {
  id: string;
  version: number;
  status: Status;
  user: Profile;
}) {
  const [action, setAction] = useState(""),
    [reason, setReason] = useState(""),
    [rejection, setRejection] = useState("EVIDENCE"),
    [message, setMessage] = useState(""),
    [link, setLink] = useState(""),
    [pending, setPending] = useState(false);
  const router = useRouter();
  const actions = [
    ...(status === "WAITING_MENTOR_REVIEW" && can(user, "evidence.precheck")
      ? [{ code: "precheck", label: "ผ่านเบื้องต้น · ส่งต่อ", icon: CheckCheck }]
      : []),
    ...(status === "WAITING_FINAL_REVIEW" &&
    can(user, "evidence.final_review") &&
    user.role !== "MENTOR"
      ? [{ code: "verify", label: "ตรวจสอบหลักฐานผ่าน", icon: CheckCheck }]
      : []),
    ...(["WAITING_MENTOR_REVIEW", "WAITING_FINAL_REVIEW"].includes(status) &&
    can(user, "evidence.request_reupload")
      ? [{ code: "reupload", label: "ขอหลักฐานใหม่", icon: RefreshCw }]
      : []),
    ...(status === "WAITING_FINAL_REVIEW" &&
    can(user, "evidence.reject") &&
    user.role !== "MENTOR"
      ? [{ code: "reject", label: "ปฏิเสธการตรวจสอบ", icon: XCircle }]
      : []),
  ];
  async function getLink() {
    setPending(true);
    try {
      const r = await fetch(`/api/leaves/${id}/link`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        setMessage(data.error);
        return;
      }
      setLink(data.url);
      try {
        await navigator.clipboard.writeText(data.url);
        setMessage("คัดลอกลิงก์แล้ว ส่งให้พนักงานโดยตรงได้เลย");
      } catch {
        setMessage("เลือกลิงก์ด้านล่างเพื่อคัดลอก");
      }
    } catch {
      setMessage("ไม่สามารถเชื่อมต่อได้");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="review-actions">
      {["WAITING_EVIDENCE", "REUPLOAD_REQUIRED"].includes(status) && (
        <div className="upload-link-box">
          <strong>ลิงก์อัปโหลดหลักฐาน</strong>
          <p>ส่งให้พนักงานโดยตรง ลิงก์นี้ใช้ได้ครั้งเดียวและไม่ต้องเข้าสู่ระบบ</p>
          <Button variant="outline" disabled={pending} onClick={getLink}>
            <Copy size={16} />
            คัดลอกลิงก์อัปโหลด
          </Button>
          {link && (
            <div className="link-preview">
              <input
                aria-label="ลิงก์อัปโหลด"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
              />
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                aria-label="เปิดหน้าลิงก์"
              >
                <ExternalLink size={17} />
              </a>
            </div>
          )}
        </div>
      )}
      <div className="row wrap">
        {actions.map((a) => (
          <Button
            key={a.code}
            variant={
              a.code === "reject"
                ? "destructive"
                : a.code === "reupload"
                  ? "outline"
                  : "default"
            }
            onClick={() => {
              setReason("");
              setMessage("");
              setAction(a.code);
            }}
          >
            <a.icon size={16} />
            {a.label}
          </Button>
        ))}
      </div>
      {message && (
        <p role="status" className="alert">
          {message}
        </p>
      )}
      <Modal
        open={!!action}
        onOpenChange={(o) => {
          if (!o) setAction("");
        }}
        title={
          actions.find((a) => a.code === action)?.label || "ยืนยันการดำเนินการ"
        }
        description="การดำเนินการนี้จะเปลี่ยนสถานะและบันทึกประวัติผู้ตรวจสอบ"
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              const r = await fetch(`/api/leaves/${id}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action,
                  version,
                  reason,
                  rejection_type: action === "reject" ? rejection : undefined,
                }),
              });
              const data = await r.json();
              if (!r.ok) setMessage(data.error);
              else {
                setAction("");
                setLink("");
                setMessage("บันทึกการตรวจสอบเรียบร้อยแล้ว");
                router.refresh();
              }
            } catch {
              setMessage("ไม่สามารถเชื่อมต่อได้");
            } finally {
              setPending(false);
            }
          }}
        >
          {action === "reject" && (
            <label>
              ประเภทการปฏิเสธ
              <select
                value={rejection}
                onChange={(e) => setRejection(e.target.value)}
              >
                <option value="EVIDENCE">ปฏิเสธหลักฐาน</option>
                <option value="LEAVE_DATA">ไม่ผ่านการตรวจข้อมูลใบลา</option>
              </select>
            </label>
          )}
          <label>
            {["reupload", "reject"].includes(action)
              ? "เหตุผล (จำเป็น)"
              : "ความคิดเห็น"}
            <textarea
              rows={4}
              maxLength={2000}
              required={["reupload", "reject"].includes(action)}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {message && (
            <p role="alert" className="error-box">
              {message}
            </p>
          )}
          <Button disabled={pending}>
            {pending ? "กำลังบันทึก…" : "ยืนยันการดำเนินการ"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
