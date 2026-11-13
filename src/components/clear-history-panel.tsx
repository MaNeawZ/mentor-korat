"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { AUDIT_CLEAR_CONFIRMATION } from "@/lib/data-clear";
const endpoint = "/api/settings/clear-data";
export function ClearHistoryPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<{
    count: number;
    snapshot: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState(""),
    [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState("");
  async function loadPreview() {
    setPending(true);
    setPreview(null);
    setConfirmation("");
    setAcknowledged(false);
    setError("");
    try {
      const r = await fetch(`${endpoint}?scope=history`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "อ่านจำนวนประวัติไม่สำเร็จ");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถเชื่อมต่อได้");
    } finally {
      setPending(false);
    }
  }
  async function clear() {
    if (
      !preview ||
      !acknowledged ||
      confirmation !== AUDIT_CLEAR_CONFIRMATION ||
      reason.trim().length < 5 ||
      pending
    )
      return;
    setPending(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear_history",
          snapshot: preview.snapshot,
          confirmation,
          reason,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "ล้างประวัติไม่สำเร็จ");
      setOpen(false);
      setReason("");
      setResult(
        `ล้างประวัติเก่าแล้ว ${data.cleared} รายการ เก็บบันทึกการล้างครั้งนี้ไว้ 1 รายการ`,
      );
      router.refresh();
    } catch (e) {
      setPreview(null);
      setConfirmation("");
      setAcknowledged(false);
      setError(
        e instanceof Error
          ? e.message
          : "การเชื่อมต่อขัดข้อง กรุณาตรวจสอบประวัติก่อนลองใหม่",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel detail-panel clear-data-panel">
      <h2>ล้างประวัติการดำเนินการ</h2>
      <p>
        ลบประวัติเก่าทั้งหมด รวมใบลา การแก้พนักงาน และการตั้งค่า โดยเก็บบันทึกการล้างครั้งล่าสุดไว้
        1 รายการ การลบย้อนกลับไม่ได้
      </p>
      <p className="muted">
        ปุ่มนี้ลบเฉพาะประวัติ ข้อมูลพนักงาน แผนก Mentor การตั้งค่า และใบลาปัจจุบันยังคงอยู่
      </p>
      <Button
        variant="destructive"
        disabled={!enabled || pending}
        onClick={() => {
          setOpen(true);
          setResult("");
          void loadPreview();
        }}
      >
        ล้างประวัติเก่าทั้งหมด
      </Button>
      {!enabled && <p>ต้องมีสิทธิ์ data.clear และติดตั้ง migration ล่าสุดก่อนใช้งาน</p>}
      {result && (
        <p className="success-box" role="status">
          {result}
        </p>
      )}
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
        title="ยืนยันล้างประวัติทั้งหมด"
        description="ตรวจสอบจำนวนก่อนลบ รวมประวัติการแก้พนักงานและการตั้งค่า"
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void clear();
          }}
        >
          {preview ? (
            <p>
              จะลบประวัติเก่าทั้งหมด <strong>{preview.count}</strong> รายการ
              และสร้างบันทึกการล้างครั้งนี้ 1 รายการ
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void loadPreview()}
            >
              {pending ? "กำลังตรวจสอบ…" : "ตรวจสอบจำนวนประวัติใหม่"}
            </Button>
          )}
          <label>
            เหตุผลในการล้างประวัติ
            <textarea
              required
              minLength={5}
              maxLength={500}
              disabled={pending}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label>
            พิมพ์ {AUDIT_CLEAR_CONFIRMATION} เพื่อยืนยัน
            <input
              autoComplete="off"
              disabled={pending}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <label className="clear-ack">
            <input
              type="checkbox"
              disabled={pending}
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            ฉันยอมรับการลบประวัติเก่าทั้งหมดตามจำนวนข้างต้น
          </label>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <Button
            variant="destructive"
            disabled={
              pending ||
              !preview ||
              !acknowledged ||
              confirmation !== AUDIT_CLEAR_CONFIRMATION ||
              reason.trim().length < 5
            }
          >
            {pending ? "กำลังดำเนินการ…" : "ยืนยันล้างประวัติถาวร"}
          </Button>
        </form>
      </Modal>
    </section>
  );
}
