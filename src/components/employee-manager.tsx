"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityForm, type Field } from "./entity-form";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
type Employee = {
  id: string;
  code: string;
  name: string;
  department_id: string;
  mentor_id: string | null;
  active: boolean;
  departments: { name: string } | null;
};
export function EmployeeManager({
  employees,
  departments,
  mentors,
  manage,
  assign,
}: {
  employees: Employee[];
  departments: { id: string; name: string }[];
  mentors: { id: string; name: string }[];
  manage: boolean;
  assign: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [mentor, setMentor] = useState(""),
    [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  const fields: Field[] = [
    {
      key: "code",
      label: "รหัสพนักงาน",
      required: true,
      help: "ตัวอักษรอังกฤษหรือตัวเลข 3–12 ตัว เช่น 68364 หรือ OLS768563",
    },
    { key: "name", label: "ชื่อ–นามสกุล", required: true },
    {
      key: "department_id",
      label: "แผนก",
      type: "select",
      required: true,
      options: departments.map((d) => ({ value: d.id, label: d.name })),
    },
    ...(assign
      ? [
          {
            key: "mentor_id",
            label: "Mentor",
            type: "select",
            options: [
              { value: "", label: "ยังไม่มอบหมาย" },
              ...mentors.map((m) => ({ value: m.id, label: m.name })),
            ],
          } as Field,
        ]
      : []),
    { key: "active", label: "เปิดใช้งานพนักงาน", type: "checkbox" },
  ];
  return (
    <>
      <div className="manager-toolbar row wrap">
        {manage && (
          <EntityForm
            title="เพิ่มพนักงาน"
            endpoint="/api/manage/employee"
            fields={fields}
            initial={{
              active: true,
              mentor_id: null,
              department_id: departments[0]?.id,
            }}
          />
        )}
        {assign && (
          <Button
            variant="outline"
            disabled={!selected.length}
            onClick={() => setOpen(true)}
          >
            มอบหมาย Mentor ({selected.length})
          </Button>
        )}
        {message && (
          <span role="status" className="muted">
            {message}
          </span>
        )}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {assign && (
                <th>
                  <input
                    aria-label="เลือกทั้งหมดในหน้านี้"
                    type="checkbox"
                    checked={
                      employees.length > 0 &&
                      selected.length === employees.length
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? employees.map((x) => x.id) : [],
                      )
                    }
                  />
                </th>
              )}
              <th>รหัสพนักงาน</th>
              <th>ชื่อ–นามสกุล</th>
              <th>แผนก</th>
              <th>Mentor</th>
              <th>สถานะ</th>
              {manage && <th>จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                {assign && (
                  <td>
                    <input
                      aria-label={`เลือก ${e.name}`}
                      type="checkbox"
                      checked={selected.includes(e.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, e.id]
                            : selected.filter((id) => id !== e.id),
                        )
                      }
                    />
                  </td>
                )}
                <td className="mono">{e.code}</td>
                <td>
                  <strong>{e.name}</strong>
                </td>
                <td>{e.departments?.name}</td>
                <td>
                  {mentors.find((m) => m.id === e.mentor_id)?.name ||
                    (e.mentor_id ? "มอบหมายแล้ว" : "ยังไม่มอบหมาย")}
                </td>
                <td>
                  <span
                    className={`badge ${e.active ? "status-VERIFIED" : "status-REJECTED"}`}
                  >
                    <i />
                    {e.active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                {manage && (
                  <td>
                    <EntityForm
                      key={`${e.id}-${e.mentor_id}-${e.active}-${e.name}`}
                      title="แก้ไขข้อมูลพนักงาน"
                      trigger="แก้ไข"
                      endpoint="/api/manage/employee"
                      fields={fields}
                      initial={e}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!employees.length && (
          <div className="empty-state">
            <h3>ยังไม่มีพนักงานในรายการนี้</h3>
            <p>เพิ่มแผนกและพนักงานเพื่อเริ่มต้นใช้งาน</p>
          </div>
        )}
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="ยืนยันมอบหมาย Mentor"
        description={`เปลี่ยนผู้ดูแลพนักงาน ${selected.length} คน และใบลาที่ยังดำเนินการไม่เสร็จ`}
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              const r = await fetch("/api/manage/assignment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  employee_ids: selected,
                  mentor_id: mentor || null,
                }),
              });
              const data = await r.json();
              if (!r.ok) setMessage(data.error);
              else {
                setMessage("มอบหมาย Mentor เรียบร้อยแล้ว");
                setSelected([]);
                setOpen(false);
                router.refresh();
              }
            } catch {
              setMessage("ไม่สามารถเชื่อมต่อได้");
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            ผู้ดูแล
            <select value={mentor} onChange={(e) => setMentor(e.target.value)}>
              <option value="">ยังไม่มอบหมาย</option>
              {mentors.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {message && <p role="alert">{message}</p>}
          <Button disabled={pending}>
            {pending ? "กำลังมอบหมาย…" : "ยืนยันมอบหมาย"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
