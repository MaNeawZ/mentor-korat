"use client";
import { useEffect, useState, useCallback, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  ArrowUpRight,
  Inbox,
  LoaderCircle,
} from "lucide-react";
import { type NotificationItem } from "@/lib/notifications";
import { NotificationItemView } from "./notification-item";
export function NotificationBell() {
  const [data, setData] = useState<{
    items: NotificationItem[];
    unread: number;
  }>({
    items: [],
    unread: 0,
  });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false),
    [pending, setPending] = useState(false),
    [offline, setOffline] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    panelId = useId();
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
        const next = (await r.json()) as {
          items: NotificationItem[];
          unread: number;
        };
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
        setOffline(false);
      } else setOffline(true);
    } catch {
      /* Keep the last successful snapshot while offline. */
      setOffline(true);
    } finally {
      setLoaded(true);
      inFlight.current = false;
    }
  }, [router]);
  useEffect(() => {
    const initial = setTimeout(() => void poll(), 0);
    const id = setInterval(() => {
      void poll();
    }, 5000);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("notifications-changed", poll);
    return () => {
      clearInterval(id);
      clearTimeout(initial);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("notifications-changed", poll);
    };
  }, [poll, router]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function mark(id: string | null) {
    setPending(true);
    try {
      const result = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!result.ok) throw new Error("save failed");
      setError("");
      setData((previous) => ({
        items: previous.items.map((item) =>
          id === null || item.id === id
            ? { ...item, read_at: item.read_at || new Date().toISOString() }
            : item,
        ),
        unread:
          id === null
            ? 0
            : Math.max(
                0,
                previous.unread -
                  (previous.items.some(
                    (item) => item.id === id && !item.read_at,
                  )
                    ? 1
                    : 0),
              ),
      }));
      void poll();
      router.refresh();
    } catch {
      setError("บันทึกสถานะอ่านไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="notification-bell-wrap" ref={root}>
      <button
        aria-label={`การแจ้งเตือน ${data.unread} รายการยังไม่อ่าน`}
        className={`icon-btn notification-trigger ${open ? "is-open" : ""}`}
        ref={trigger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} />
        {data.unread > 0 && (
          <b className="notification-counter">
            {data.unread > 99 ? "99+" : data.unread}
          </b>
        )}
      </button>
      {open && (
        <div
          className="notifications-popover"
          id={panelId}
          role="dialog"
          aria-label="การแจ้งเตือน"
          ref={panel}
          tabIndex={-1}
        >
          <div className="notifications-popover-head">
            <div>
              <span className="notification-eyebrow">อัปเดตงานของคุณ</span>
              <h2>
                การแจ้งเตือน{" "}
                {data.unread > 0 && (
                  <span className="notification-count-pill">{data.unread}</span>
                )}
              </h2>
            </div>
            <button
              className="notification-mark-all"
              disabled={pending || data.unread === 0}
              onClick={() => void mark(null)}
              title="ทำเครื่องหมายอ่านทั้งหมด"
            >
              {pending ? (
                <LoaderCircle size={16} className="notification-spinner" />
              ) : (
                <CheckCheck size={17} />
              )}
              <span>อ่านทั้งหมด</span>
            </button>
          </div>
          <div className="notifications-popover-subhead">
            <span>ล่าสุด</span>
            <span>
              {data.unread ? `${data.unread} รายการยังไม่ได้อ่าน` : "อ่านครบแล้ว"}
            </span>
          </div>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <div className="notifications-popover-items">
            {!loaded ? (
              <div className="notification-empty">
                <LoaderCircle className="notification-spinner" size={25} />
                <p>กำลังโหลดการแจ้งเตือน…</p>
              </div>
            ) : data.items.length === 0 ? (
              <div className="notification-empty">
                <span className="notification-empty-symbol">
                  <Inbox size={27} />
                </span>
                <strong>
                  {offline ? "ยังโหลดรายการไม่ได้" : "ยังไม่มีการแจ้งเตือน"}
                </strong>
                <p>
                  {offline
                    ? "ตรวจการเชื่อมต่อแล้วลองอีกครั้ง"
                    : "เมื่อมีใบลาหรือหลักฐานใหม่ เราจะแจ้งให้คุณทราบที่นี่"}
                </p>
                {offline && (
                  <button className="text-link" onClick={() => void poll()}>
                    ลองใหม่
                  </button>
                )}
              </div>
            ) : (
              data.items.map((n) => (
                <NotificationItemView
                  compact
                  key={n.id}
                  item={n}
                  onOpen={() => {
                    if (!n.read_at) void mark(n.id);
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="notifications-popover-footer"
          >
            ดูการแจ้งเตือนทั้งหมด <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
