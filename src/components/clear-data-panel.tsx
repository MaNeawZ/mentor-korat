"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import {
  CLEAR_CONFIRMATION,
  clearCountLabels,
  type ClearPreview,
} from "@/lib/data-clear";

const endpoint = "/api/settings/clear-data";
async function previewData(): Promise<ClearPreview> {
  const response = await fetch(endpoint, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "อ่านจำนวนข้อมูลไม่สำเร็จ");
  return data;
}
export function ClearDataPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ClearPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [storage, setStorage] = useState<{
    pending: number;
    failed: number;
  } | null>(null);

  // Status reads never trigger deletion. Failed files await an explicit retry.
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = async () => {
      try {
        const data = await previewData();
        if (active)
          setStorage({
            pending: data.storage_pending,
            failed: data.storage_failed,
          });
      } catch {
        /* The explicit preview displays setup/authentication errors. */
      }
    };
    const initial = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [enabled]);

  async function loadPreview() {
    setPending(true);
    setPreview(null);
    setConfirmation("");
    setAcknowledged(false);
    setError("");
    try {
      setPreview(await previewData());
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านข้อมูลไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }
  async function submit(action: "clear" | "retry_files") {
    setPending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "clear"
            ? { action, snapshot: preview?.snapshot, confirmation, reason }
            : { action },
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        if (action === "clear") {
          setPreview(null);
          setConfirmation("");
          setAcknowledged(false);
        }
        throw new Error(data.error || "ดำเนินการไม่สำเร็จ");
      }
      if (action === "clear") {
        setOpen(false);
        setPreview(null);
        setReason("");
        setResult(
          `ล้างข้อมูลในฐานข้อมูลแล้ว: ใบลา ${data.cleared.leaves} รายการ หลักฐาน ${data.cleared.evidence} ไฟล์`,
        );
        setStorage({ pending: data.storage_pending, failed: 0 });
        router.refresh();
      } else {
        setResult("ส่งคิวลบไฟล์ที่ไม่สำเร็จให้ลองใหม่แล้ว");
        const status = await previewData();
        setStorage({
          pending: status.storage_pending,
          failed: status.storage_failed,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "การเชื่อมต่อขัดข้อง กรุณาตรวจสอบข้อมูลก่อนลองอีกครั้ง",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel detail-panel clear-data-panel">
      <h2>ล้างข้อมูลใบลา</h2>
      <p>
        สำหรับเคลียร์รายการทดสอบ จะลบใบลาทั้งหมด หลักฐาน คิว LINE / Discord
        และแจ้งเตือนในเว็บ การลบย้อนกลับไม่ได้
      </p>
      <p className="muted">
        เก็บพนักงาน แผนก Mentor บัญชีผู้ใช้ การตั้งค่า และบันทึกตรวจสอบไว้ ข้อความแจ้งเตือน
        Discord ยังอยู่ ส่วนข้อความแนบรูปหลักฐานจะลบผ่านคิว
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
        ตรวจสอบข้อมูลก่อนล้าง
      </Button>
      {!enabled && <p>ต้องมีสิทธิ์ data.clear และติดตั้ง migration ล่าสุดก่อนใช้งาน</p>}
      {result && (
        <p role="status" className="success-box">
          {result}
        </p>
      )}
      {storage && storage.pending > 0 && (
        <div role="status">
          <p>
            ไฟล์หลักฐานรอลบจาก Discord / Storage {storage.pending} ไฟล์
            {storage.failed > 0
              ? ` (ลบไม่สำเร็จ ${storage.failed} ไฟล์)`
              : " — ระบบกำลังดำเนินการและลองใหม่อัตโนมัติ"}
          </p>
          {storage.failed > 0 && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void submit("retry_files")}
            >
              ลองลบไฟล์ที่ไม่สำเร็จอีกครั้ง
            </Button>
          )}
        </div>
      )}
      {storage?.pending === 0 && result && (
        <p role="status">ไม่มีไฟล์หลักฐานค้างในคิวลบ</p>
      )}
      {error && !open && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
        title="ยืนยันล้างข้อมูลใบลา"
        description="ตรวจสอบจำนวนข้อมูลทั้งหมดก่อนลบ ข้อมูลเหล่านี้กู้คืนผ่านระบบไม่ได้"
      >
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              preview &&
              acknowledged &&
              confirmation === CLEAR_CONFIRMATION &&
              reason.trim().length >= 5 &&
              !pending
            )
              void submit("clear");
          }}
        >
          <p>
            ไม่มีการแยกแท็กรายการทดสอบ: จะลบข้อมูลทั้งหมดตามจำนวนด้านล่าง
            รวมถึงใบลาที่ใช้งานจริง
          </p>
          {preview && (
            <dl className="clear-counts">
              {Object.entries(clearCountLabels).map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{preview.counts[key] ?? 0}</dd>
                </div>
              ))}
            </dl>
          )}
          {!preview && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void loadPreview()}
            >
              {pending ? "กำลังตรวจสอบ…" : "ตรวจสอบจำนวนข้อมูลใหม่"}
            </Button>
          )}
          <p className="muted">
            เก็บประวัติการลบและรหัสเหตุการณ์ LINE ขั้นต่ำไว้ป้องกันข้อความเดิมถูกส่งซ้ำ
            ไฟล์หลักฐานจะถูกลบผ่านคิวหลังล้างฐานข้อมูลสำเร็จ
          </p>
          <label>
            เหตุผลในการล้างข้อมูล
            <textarea
              required
              minLength={5}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
          </label>
          <label>
            พิมพ์ {CLEAR_CONFIRMATION} เพื่อยืนยัน
            <input
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={pending}
            />
          </label>
          <label className="clear-ack">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={pending}
            />
            ฉันตรวจสอบจำนวนแล้ว และยอมรับการลบข้อมูลทั้งหมดข้างต้น
          </label>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <Button
            variant="destructive"
            disabled={
              pending ||
              !preview ||
              !acknowledged ||
              confirmation !== CLEAR_CONFIRMATION ||
              reason.trim().length < 5
            }
          >
            {pending ? "กำลังดำเนินการ…" : "ยืนยันล้างข้อมูลถาวร"}
          </Button>
        </form>
      </Modal>
    </section>
  );
}
