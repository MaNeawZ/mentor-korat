"use client";
import { useState } from "react";
import { Search, Users, Network, UserRoundCheck } from "lucide-react";
import {
  buildOrgChart,
  type OrgData,
  type OrgEmployee,
  type OrgPerson,
} from "@/lib/org-chart";

function Person({ person }: { person: OrgPerson }) {
  return (
    <div className="org-person">
      <span className="avatar">{person.name.slice(0, 1)}</span>
      <div>
        <strong>{person.name}</strong>
        <small>
          {person.role === "CENTER_HEAD"
            ? "หัวหน้าศูนย์"
            : person.role === "HR"
              ? "HR"
              : "Mentor"}
          {!person.active && " · ปิดใช้งาน"}
        </small>
      </div>
    </div>
  );
}
function EmployeeList({ employees }: { employees: OrgEmployee[] }) {
  return (
    <ul className="org-members">
      {employees.map((employee) => (
        <li key={employee.id}>
          <span className="org-member-dot" aria-hidden="true" />
          <div>
            <strong>{employee.name}</strong>
            <small>
              <span className="mono">{employee.code}</span> ·{" "}
              {employee.department}
              {!employee.active && " · ปิดใช้งาน"}
            </small>
          </div>
        </li>
      ))}
    </ul>
  );
}
export function OrgChart({ data }: { data: OrgData }) {
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const chart = buildOrgChart(data, query, includeInactive);
  return (
    <div className="org-chart">
      {data.scoped && (
        <p className="org-notice" role="note">
          แสดงเฉพาะทีมที่คุณดูแลตามสิทธิ์ของบัญชี
        </p>
      )}
      <div className="panel org-controls">
        <label className="org-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="ค้นหาในโครงสร้างทีม"
            placeholder="ค้นหาชื่อ รหัสพนักงาน แผนก หรือ Mentor"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          รวมผู้ที่ปิดใช้งาน
        </label>
      </div>
      <div className="org-summary" aria-live="polite">
        <span>
          <UserRoundCheck size={17} />
          หัวหน้าศูนย์และ HR <strong>{chart.leaders.length}</strong>
        </span>
        <span>
          <Network size={17} />
          Mentor <strong>{chart.teams.length}</strong>
        </span>
        <span>
          <Users size={17} />
          พนักงานที่แสดง <strong>{chart.employeeCount}</strong>
        </span>
        {!data.scoped && (
          <span>
            รอมอบหมาย / ตรวจสอบ <strong>{chart.unassigned.length}</strong>
          </span>
        )}
      </div>
      <section
        className="org-leadership panel"
        aria-labelledby="org-leaders-title"
      >
        <span className="eyebrow">CENTER LEADERSHIP</span>
        <h2 id="org-leaders-title">หัวหน้าศูนย์และ HR</h2>
        <p className="muted">ดูแล Mentor ร่วมกัน</p>
        <div className="org-leader-grid">
          {(["CENTER_HEAD", "HR"] as const).map((role) => (
            <section
              key={role}
              aria-label={role === "CENTER_HEAD" ? "หัวหน้าศูนย์" : "HR"}
            >
              <h3>{role === "CENTER_HEAD" ? "หัวหน้าศูนย์" : "HR"}</h3>
              {chart.leaders
                .filter((person) => person.role === role)
                .map((person) => (
                  <Person key={person.id} person={person} />
                ))}
              {!chart.leaders.some((person) => person.role === role) && (
                <p className="muted">ยังไม่มีผู้ใช้งานในบทบาทนี้</p>
              )}
            </section>
          ))}
        </div>
      </section>
      <div className="org-trunk" aria-hidden="true">
        <span>Mentor และพนักงานในความดูแล</span>
      </div>
      <section className="org-teams" aria-label="Mentor และพนักงานในความดูแล">
        {chart.teams.map((team) => (
          <article className="org-team panel" key={team.mentor.id}>
            <Person person={team.mentor} />
            {!team.mentor.active && team.total > 0 && (
              <p className="org-warning">Mentor ปิดใช้งาน แต่ยังมีพนักงานในความดูแล</p>
            )}
            <details open>
              <summary>
                พนักงาน {team.employees.length} คน
                {query && ` จาก ${team.total} คน`}
              </summary>
              <EmployeeList employees={team.employees} />
              {!team.employees.length && (
                <p className="muted org-no-members">ยังไม่มีพนักงานในความดูแล</p>
              )}
            </details>
          </article>
        ))}
      </section>
      {!chart.teams.length && (
        <div className="panel empty-state">
          <h3>{query ? "ไม่พบทีมที่ตรงกับการค้นหา" : "ยังไม่มี Mentor ที่แสดงได้"}</h3>
          <p>ตรวจสอบตัวกรอง หรือเพิ่มผู้ใช้บทบาท Mentor ในหน้าจัดการผู้ใช้</p>
        </div>
      )}
      {(!data.scoped || chart.unassigned.length > 0) && (
        <section
          className="org-unassigned panel"
          aria-labelledby="org-unassigned-title"
        >
          <h2 id="org-unassigned-title">
            พนักงานรอมอบหมาย Mentor{" "}
            <span className="muted">({chart.unassigned.length})</span>
          </h2>
          <p className="muted">
            ยังไม่ผูกกับ Mentor หรือผู้ดูแลเดิมเปลี่ยนบทบาท กรุณาตรวจสอบในหน้าพนักงาน
          </p>
          <EmployeeList employees={chart.unassigned} />
          {!chart.unassigned.length && (
            <p className="muted">ไม่มีพนักงานรอมอบหมายที่ตรงกับตัวกรอง</p>
          )}
        </section>
      )}
    </div>
  );
}
