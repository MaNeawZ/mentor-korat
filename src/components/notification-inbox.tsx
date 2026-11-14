import Link from "next/link";
import { Bell, Inbox, CheckCheck } from "lucide-react";
import { type NotificationItem } from "@/lib/notifications";
import { NotificationItemView } from "./notification-item";
import { NotificationControls } from "./notification-controls";
import { Pagination } from "./leave-table";
export function NotificationInbox({
  items,
  total,
  unread,
  page = 1,
  unreadOnly = false,
  count,
}: {
  items: NotificationItem[];
  total: number;
  unread: number;
  page?: number;
  unreadOnly?: boolean;
  count: number;
}) {
  return (
    <>
      <div className="notification-summary">
        <span className="notification-summary-icon">
          <Bell size={22} />
        </span>
        <div>
          <strong>
            {unread
              ? `คุณมี ${unread} การแจ้งเตือนที่ยังไม่ได้อ่าน`
              : "อ่านครบแล้ว พร้อมสำหรับงานถัดไป"}
          </strong>
          <p>
            {total
              ? `ทั้งหมด ${total} รายการ · เปิดรายการเพื่อดูรายละเอียดที่เกี่ยวข้อง`
              : "เมื่อมีใบลาหรือหลักฐานใหม่ รายการจะแสดงที่นี่"}
          </p>
        </div>
        <span className="notification-summary-check">
          <CheckCheck size={22} />
        </span>
      </div>
      <section className="panel notification-inbox">
        <div className="notification-inbox-toolbar">
          <nav className="notification-tabs" aria-label="ตัวกรองการแจ้งเตือน">
            <Link
              href="/notifications"
              aria-current={!unreadOnly ? "page" : undefined}
            >
              ทั้งหมด <span>{total}</span>
            </Link>
            <Link
              href="/notifications?filter=unread"
              aria-current={unreadOnly ? "page" : undefined}
            >
              ยังไม่อ่าน <span>{unread}</span>
            </Link>
          </nav>
          <span className="notification-order">ใหม่ที่สุดก่อน</span>
        </div>
        {items.length ? (
          items.map((item) => (
            <NotificationItemView
              key={item.id}
              item={item}
              action={
                !item.read_at ? (
                  <NotificationControls id={item.id} />
                ) : undefined
              }
            />
          ))
        ) : (
          <div className="notification-empty is-large">
            <span className="notification-empty-symbol">
              {unreadOnly ? <CheckCheck size={32} /> : <Inbox size={32} />}
            </span>
            <h2>{unreadOnly ? "อ่านครบแล้ว" : "ยังไม่มีการแจ้งเตือน"}</h2>
            <p>
              {unreadOnly
                ? "ไม่มีรายการที่ยังไม่ได้อ่านในขณะนี้"
                : "ใบลา หลักฐาน และความคืบหน้าของงานจะแสดงที่นี่"}
            </p>
            {unreadOnly && (
              <Link href="/notifications" className="text-link">
                ดูรายการทั้งหมด →
              </Link>
            )}
          </div>
        )}
        <Pagination
          page={page}
          count={count}
          path="/notifications"
          filters={{ filter: unreadOnly ? "unread" : undefined }}
        />
      </section>
    </>
  );
}
