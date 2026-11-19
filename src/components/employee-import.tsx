"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_IMPORT_BYTES,
  parseEmployeeCsv,
  type ImportEmployee,
} from "@/lib/employee-import";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

export function EmployeeImport({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState("");
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ImportEmployee[]>([]);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setCsv("");
          setRows([]);
          setError("");
          setSuccess("");
        }}
      >
        นำเข้าพนักงาน CSV
      </Button>
      {success && (
        <span role="status" className="success-inline">
          {success}
        </span>
      )}
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!pending && !reading) setOpen(value);
        }}
        title="นำเข้าพนักงานจาก CSV"
        description="เลือกแผนกสำหรับพนักงานในไฟล์ รหัสที่มีอยู่แล้วจะถูกข้าม พนักงานใหม่จะยังไม่มี Mentor"
      >
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!rows.length || !department || pending || reading) return;
            setPending(true);
            setError("");
            try {
              const response = await fetch(
                `/api/manage/employees-import?department_id=${encodeURIComponent(department)}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "text/csv; charset=utf-8" },
                  body: csv,
                },
              );
              const result = await response.json();
              if (!response.ok) {
                setError(result.error || "ไม่สามารถนำเข้าได้");
                return;
              }
              setSuccess(
                `นำเข้าสำเร็จ ${result.added} คน ข้ามรหัสที่มีอยู่แล้ว ${result.skipped} คน`,
              );
              setOpen(false);
              setCsv("");
              setRows([]);
              router.refresh();
            } catch {
              setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่");
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            แผนกสำหรับพนักงานที่นำเข้า
            <select
              required
              value={department}
              disabled={pending}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">เลือกแผนก</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {!departments.length && <p role="alert">กรุณาเพิ่มแผนกก่อนนำเข้าพนักงาน</p>}
          <label>
            ไฟล์ CSV (UTF-8 สูงสุด 2 MB / 2,000 คน)
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={pending || reading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                setRows([]);
                setCsv("");
                setError("");
                if (!file) return;
                setReading(true);
                try {
                  if (file.size > MAX_IMPORT_BYTES)
                    throw new Error("ไฟล์ CSV ต้องมีขนาดไม่เกิน 2 MB");
                  let source: string;
                  try {
                    source = new TextDecoder("utf-8", { fatal: true }).decode(
                      await file.arrayBuffer(),
                    );
                  } catch {
                    throw new Error("กรุณาบันทึกไฟล์เป็น CSV UTF-8");
                  }
                  const parsed = parseEmployeeCsv(source);
                  setRows(parsed);
                  setCsv(source);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setReading(false);
                }
              }}
            />
            <small>
              รองรับ code,name,active หรือ id,first_name,last_name,status ตามไฟล์
              app_employees_rows.csv
            </small>
          </label>
          <p className="muted">
            นำเข้าเฉพาะรหัส ชื่อ–นามสกุล และสถานะ คอลัมน์ตำแหน่ง ชื่อเล่น และวันที่จะไม่ถูกบันทึก
          </p>
          {rows.length > 0 && (
            <>
              <p role="status">
                ตรวจสอบผ่าน {rows.length} คน · ตัวอย่าง {Math.min(rows.length, 5)}{" "}
                คนแรก
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>รหัส</th>
                      <th>ชื่อ–นามสกุล</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row) => (
                      <tr key={row.code}>
                        <td className="mono">{row.code}</td>
                        <td>{row.name}</td>
                        <td>{row.active ? "ใช้งาน" : "ปิดใช้งาน"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="row end">
            <Button
              type="button"
              variant="ghost"
              disabled={pending || reading}
              onClick={() => setOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button
              disabled={pending || reading || !rows.length || !department}
            >
              {pending
                ? "กำลังนำเข้า…"
                : reading
                  ? "กำลังอ่านไฟล์…"
                  : `ยืนยันนำเข้า ${rows.length} คน`}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
