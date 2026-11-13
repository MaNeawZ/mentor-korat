"use client";
import { useEffect, useState } from "react";
import { UploadCloud, Camera, CheckCircle2, X } from "lucide-react";
import { Button } from "./ui/button";
export function UploadForm({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function select(f?: File) {
    setMessage("");
    if (!f) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      f.size > 8 * 1024 * 1024
    ) {
      setMessage("กรุณาเลือกรูป JPEG, PNG หรือ WebP ขนาดไม่เกิน 8 MB");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }
  if (done)
    return (
      <div className="upload-success">
        <CheckCircle2 size={56} />
        <h2>ส่งหลักฐานเรียบร้อยแล้ว</h2>
        <p>
          Mentor จะได้รับแจ้งเตือนเพื่อตรวจสอบต่อไป
          <br />
          คุณสามารถปิดหน้านี้ได้
        </p>
      </div>
    );
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setPending(true);
        setMessage("");
        try {
          let upload = file;
          if (file.size > 1024 * 1024) {
            try {
              const bitmap = await createImageBitmap(file);
              const scale = Math.min(
                1,
                2200 / Math.max(bitmap.width, bitmap.height),
              );
              const canvas = document.createElement("canvas");
              canvas.width = Math.round(bitmap.width * scale);
              canvas.height = Math.round(bitmap.height * scale);
              canvas
                .getContext("2d")!
                .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              bitmap.close();
              const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/webp", 0.88),
              );
              if (blob && blob.size < file.size)
                upload = new File([blob], "evidence.webp", {
                  type: "image/webp",
                });
            } catch {
              /* Server also normalizes and compresses the original. */
            }
          }
          const form = new FormData();
          form.set("file", upload);
          const r = await fetch(`/api/upload/${token}`, {
            method: "POST",
            body: form,
          });
          const data = await r.json();
          if (!r.ok) setMessage(data.error);
          else setDone(true);
        } catch {
          setMessage("อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง ลิงก์ยังไม่ถูกใช้หากไม่ได้บันทึก");
        } finally {
          setPending(false);
        }
      }}
    >
      {file ? (
        <div className="image-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="รูปหลักฐานก่อนส่ง" />
          <button
            type="button"
            className="icon-btn"
            aria-label="ลบรูป"
            disabled={pending}
            onClick={() => {
              setFile(null);
              setPreview("");
            }}
          >
            <X size={19} />
          </button>
          <small>
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </small>
        </div>
      ) : (
        <div className="upload-drop">
          <UploadCloud size={40} />
          <h3>เลือกรูปหลักฐานการลา</h3>
          <p>JPEG, PNG หรือ WebP · ไม่เกิน 8 MB</p>
          <div className="row wrap">
            <label className="btn btn-primary">
              เลือกรูปภาพ
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => select(e.target.files?.[0])}
              />
            </label>
            <label className="btn btn-outline">
              <Camera size={17} />
              ถ่ายรูป
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => select(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      )}
      {message && (
        <p className="error-box" role="alert">
          {message}
        </p>
      )}
      {file && (
        <Button disabled={pending}>
          {pending ? "กำลังส่งหลักฐาน…" : "ยืนยันส่งหลักฐาน"}
        </Button>
      )}
      <small className="muted">
        รูปภาพจะส่งถึงผู้รับผิดชอบในระบบส่วนตัวเท่านั้น
        <br />
        เมื่อส่งสำเร็จ ลิงก์นี้จะใช้ซ้ำไม่ได้
      </small>
    </form>
  );
}
