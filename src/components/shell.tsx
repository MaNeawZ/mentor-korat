"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  LayoutDashboard,
  Files,
  Users,
  UserCheck,
  ClipboardCheck,
  Settings,
  ScrollText,
  Menu,
  Sun,
  Moon,
  Monitor,
  LogOut,
  ChevronRight,
  Sprout,
  Bell,
  UserRoundCheck,
} from "lucide-react";
import { NotificationBell } from "./live";
import { can, type Profile, type Permission } from "@/lib/domain";
const nav: {
  href: string;
  label: string;
  icon: typeof Files;
  permission?: Permission;
}[] = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/leaves", label: "รายการใบลา", icon: Files },
  { href: "/mentor/tasks", label: "งานของฉัน", icon: ClipboardCheck },
  {
    href: "/reviews",
    label: "ตรวจสอบขั้นสุดท้าย",
    icon: UserRoundCheck,
    permission: "evidence.final_review",
  },
  { href: "/employees", label: "พนักงาน", icon: Users },
  {
    href: "/mentors",
    label: "Mentor และการมอบหมาย",
    icon: UserCheck,
    permission: "mentors.assign",
  },
  { href: "/notifications", label: "การแจ้งเตือน", icon: Bell },
  {
    href: "/audit-logs",
    label: "ประวัติการดำเนินการ",
    icon: ScrollText,
    permission: "audit.view",
  },
  {
    href: "/settings",
    label: "ตั้งค่าระบบ",
    icon: Settings,
    permission: "settings.manage",
  },
];
export function Shell({
  user,
  children,
}: {
  user: Profile;
  children: React.ReactNode;
}) {
  const path = usePathname(),
    router = useRouter(),
    { theme, setTheme } = useTheme();
  const [menu, setMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const title = nav.find((n) => path.startsWith(n.href))?.label || "รายละเอียด";
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="ปิดเมนู"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">
            <Sprout size={25} />
          </span>
          <span>
            KORAT<span className="brand-sub">LEAVE MONITORING</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-avatar">K</span>
          <div>
            <strong>ศูนย์โคราช</strong>
            <small>Mentor Management System</small>
          </div>
          <span className="online-dot" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav
            .filter((n) => !n.permission || can(user, n.permission))
            .map((n) => (
              <Link
                onClick={() => setMenu(false)}
                key={n.href}
                href={n.href}
                className={
                  path === n.href ||
                  (n.href != "/dashboard" && path.startsWith(n.href + "/"))
                    ? "nav-active"
                    : ""
                }
              >
                <n.icon size={19} />
                {n.label}
                {path === n.href && (
                  <ChevronRight size={16} className="nav-arrow" />
                )}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span>ทุกการดูแล เริ่มจากความใส่ใจ</span>
            <p>
              ติดตามหลักฐานและส่งต่องานให้ทีม
              <br />
              ได้อย่างเป็นระบบ
            </p>
            <div className="row">
              <i className="online-dot" /> Korat Workspace
            </div>
          </div>
          <div className="user-mini">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.role === "CENTER_HEAD" ? "หัวหน้าศูนย์" : user.role}
              </small>
            </div>
            <button
              className="icon-btn"
              disabled={loggingOut}
              title="ออกจากระบบ"
              onClick={async () => {
                setLoggingOut(true);
                try {
                  const r = await fetch("/api/auth/logout", { method: "POST" });
                  if (!r.ok) throw new Error("signout failed");
                  router.push("/login");
                  router.refresh();
                } catch {
                  setLogoutError("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
                  setLoggingOut(false);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
          {logoutError && (
            <p role="alert" className="error-box">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="row">
            <button
              className="mobile-menu icon-btn"
              aria-label="เปิดเมนู"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={14} />
              <strong>{title}</strong>
            </span>
          </div>
          <div className="row">
            <span className="top-date">
              {new Intl.DateTimeFormat("th-TH", {
                dateStyle: "long",
                timeZone: "Asia/Bangkok",
              }).format(new Date())}
            </span>
            <button
              className="icon-btn"
              aria-label={`เปลี่ยนธีม ปัจจุบัน ${theme}`}
              onClick={() =>
                setTheme(
                  theme === "light"
                    ? "dark"
                    : theme === "dark"
                      ? "system"
                      : "light",
                )
              }
            >
              {theme === "dark" ? (
                <Moon size={19} />
              ) : theme === "light" ? (
                <Sun size={19} />
              ) : (
                <Monitor size={19} />
              )}
            </button>
            <NotificationBell />
            <span className="avatar small">{user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="main-content">
          {children}
          <footer>
            © {new Date().getFullYear()} Korat Leave Monitoring{" "}
            <span>ตรวจสอบหลักฐาน · ดูแลทีมอย่างเข้าใจ</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
