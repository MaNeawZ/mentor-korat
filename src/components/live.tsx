"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
type Notice = {
  id: string;
  title: string;
  leave_id: string | null;
  read_at: string | null;
};
export function NotificationBell() {
  const [data, setData] = useState<{ items: Notice[]; unread: number }>({
    items: [],
    unread: 0,
  });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const inFlight = useRef(false);
  const lastSnapshot = useRef<string | null>(null);
  const lastRefreshAt = useRef<number | null>(null);
  const poll = useCallback(async () => {
    if (document.hidden || inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await fetch("/api/notifications");
      if (r.ok) {
        const next = (await r.json()) as { items: Notice[]; unread: number };
        const snapshot = JSON.stringify([
          next.unread,
          next.items.map((n) => [n.id, n.read_at]),
        ]);
        const now = Date.now();
        if (lastRefreshAt.current === null) lastRefreshAt.current = now;
        else if (
          (lastSnapshot.current !== null &&
            lastSnapshot.current !== snapshot) ||
          now - lastRefreshAt.current >= 60_000
        ) {
          lastRefreshAt.current = now;
          router.refresh();
        }
        lastSnapshot.current = snapshot;
        setData(next);
      }
    } catch {
      /* Keep the last successful snapshot while offline. */
    } finally {
      inFlight.current = false;
    }
  }, [router]);
  useEffect(() => {
    const initial = setTimeout(() => void poll(), 0);
    const id = setInterval(() => {
      void poll();
    }, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(id);
      clearTimeout(initial);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [poll, router]);
  async function mark(id: string | null) {
    try {
      const result = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!result.ok) throw new Error("save failed");
      setError("");
      void poll();
      router.refresh();
    } catch {
      setError("บันทึกสถานะอ่านไม่สำเร็จ กรุณาลองใหม่");
    }
  }
  return (
    <div className="notice-wrap">
      <button
        aria-label={`การแจ้งเตือน ${data.unread} รายการยังไม่อ่าน`}
        className="icon-btn"
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} />
        {data.unread > 0 && (
          <b className="notice-dot">{data.unread > 99 ? "99+" : data.unread}</b>
        )}
      </button>
      {open && (
        <div className="notice-panel">
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <div className="row between">
            <strong>การแจ้งเตือน</strong>
            <button title="อ่านทั้งหมด" onClick={() => mark(null)}>
              <CheckCheck size={18} />
            </button>
          </div>
          {data.items.length === 0 ? (
            <p className="muted">ไม่มีการแจ้งเตือนใหม่</p>
          ) : (
            data.items.map((n) => (
              <Link
                onClick={() => {
                  void mark(n.id);
                  setOpen(false);
                }}
                className={`notice ${!n.read_at ? "unread" : ""}`}
                key={n.id}
                href={n.leave_id ? `/leaves/${n.leave_id}` : "/settings/line"}
              >
                {n.title}
              </Link>
            ))
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="text-link"
          >
            ดูการแจ้งเตือนทั้งหมด →
          </Link>
        </div>
      )}
    </div>
  );
}
