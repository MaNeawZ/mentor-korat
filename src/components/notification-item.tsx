"use client";
import Link from "next/link";
import {
  FileCheck2,
  FilePenLine,
  ClipboardList,
  TriangleAlert,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import {
  notificationKind,
  notificationContext,
  notificationTime,
  type NotificationItem,
} from "@/lib/notifications";
const icons = {
  attention: TriangleAlert,
  evidence: FileCheck2,
  updated: FilePenLine,
  assigned: ClipboardList,
  status: RefreshCw,
};
export function NotificationItemView({
  item,
  compact = false,
  onOpen,
  action,
}: {
  item: NotificationItem;
  compact?: boolean;
  onOpen?: () => void;
  action?: React.ReactNode;
}) {
  const category = notificationKind(item.title),
    context = notificationContext(item),
    Icon = icons[category.kind];
  async function open() {
    if (onOpen) {
      onOpen();
      return;
    }
    if (item.read_at) return;
    try {
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
        keepalive: true,
      });
      if (r.ok) window.dispatchEvent(new Event("notifications-changed"));
    } catch {
      /* Navigation still works; failed read marks remain unread for retry. */
    }
  }
  return (
    <article
      className={`notification-item ${!item.read_at ? "is-unread" : ""} ${compact ? "is-compact" : ""}`}
    >
      <Link
        className="notification-item-link"
        href={item.leave_id ? `/leaves/${item.leave_id}` : "/settings/line"}
        onClick={() => void open()}
      >
        <span className={`notification-symbol tone-${category.kind}`}>
          <Icon size={compact ? 18 : 21} strokeWidth={1.8} />
        </span>
        <div className="notification-copy">
          <div className="notification-kicker">
            <span>{category.label}</span>
            {!item.read_at && (
              <span className="notification-unread-mark">ยังไม่อ่าน</span>
            )}
          </div>
          <strong>{item.title}</strong>
          {context.employee && (
            <p className="notification-person">{context.employee}</p>
          )}
          <div className="notification-meta">
            {context.document && (
              <span className="notification-document">{context.document}</span>
            )}
            <time dateTime={item.created_at}>
              {notificationTime(item.created_at)}
            </time>
          </div>
          {!compact && context.status && (
            <span className="notification-status">{context.status}</span>
          )}
        </div>
        <ChevronRight size={16} className="notification-chevron" />
      </Link>
      {action && <div className="notification-item-action">{action}</div>}
    </article>
  );
}
