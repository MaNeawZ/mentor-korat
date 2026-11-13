"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
export type Field = {
  key: string;
  label: string;
  type?: "text" | "select" | "checkbox" | "textarea" | "date" | "number";
  required?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
};
export function EntityForm({
  title,
  endpoint,
  fields,
  initial = {},
  trigger,
  transform,
}: {
  title: string;
  endpoint: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  trigger?: string;
  transform?: "assignment" | "setting" | "correction";
}) {
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState("");
  const router = useRouter();
  return (
    <>
      <Button
        variant={trigger ? "outline" : "default"}
        onClick={() => {
          setOpen(true);
          setMessage("");
        }}
      >
        {!trigger && <Plus size={16} />} {trigger || title}
      </Button>
      {success && (
        <span className="success-inline" role="status">
          {success}
        </span>
      )}
      <Modal title={title} open={open} onOpenChange={setOpen}>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setMessage("");
            const form = new FormData(e.currentTarget);
            const payload: Record<string, unknown> = { ...initial };
            fields.forEach((f) => {
              const v = form.get(f.key);
              payload[f.key] =
                f.type === "checkbox"
                  ? v === "on"
                  : f.type === "number"
                    ? Number(v)
                    : v === "" && ["mentor_id"].includes(f.key)
                      ? null
                      : v;
            });
            if (transform === "assignment")
              payload.employee_ids = String(payload.employee_ids)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            if (transform === "setting") {
              try {
                payload.value = JSON.parse(String(payload.value));
              } catch {
                setMessage("กรุณากรอก JSON ให้ถูกต้อง");
                setPending(false);
                return;
              }
            }
            if (transform === "correction")
              payload.version = Number(initial.version);
            try {
              const r = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const data = await r.json();
              if (!r.ok) setMessage(data.error);
              else {
                setOpen(false);
                setSuccess("บันทึกแล้ว");
                router.refresh();
              }
            } catch {
              setMessage("ไม่สามารถเชื่อมต่อระบบได้");
            } finally {
              setPending(false);
            }
          }}
        >
          {fields.map((f) => (
            <label key={f.key}>
              {f.label}
              {f.type === "select" ? (
                <select
                  name={f.key}
                  required={f.required}
                  defaultValue={String(initial[f.key] ?? "")}
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  name={f.key}
                  required={f.required}
                  defaultValue={String(initial[f.key] ?? "")}
                  rows={4}
                />
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  name={f.key}
                  defaultChecked={Boolean(initial[f.key])}
                />
              ) : (
                <input
                  type={f.type || "text"}
                  name={f.key}
                  required={f.required}
                  defaultValue={String(initial[f.key] ?? "")}
                />
              )}
              {f.help && <small>{f.help}</small>}
            </label>
          ))}
          {message && (
            <p className="error-box" role="alert">
              {message}
            </p>
          )}
          <div className="row end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button disabled={pending}>
              {pending ? "กำลังบันทึก…" : "ยืนยันและบันทึก"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
