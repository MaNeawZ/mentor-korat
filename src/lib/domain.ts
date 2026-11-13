import { z } from "zod";
export const statuses = [
  "WAITING_EVIDENCE",
  "WAITING_MENTOR_REVIEW",
  "WAITING_FINAL_REVIEW",
  "VERIFIED",
  "REUPLOAD_REQUIRED",
  "REJECTED",
] as const;
export type Status = (typeof statuses)[number];
export const statusLabels: Record<Status, string> = {
  WAITING_EVIDENCE: "รออัปโหลดหลักฐาน",
  WAITING_MENTOR_REVIEW: "รอ Mentor ตรวจสอบ",
  WAITING_FINAL_REVIEW: "รอหัวหน้าศูนย์ตรวจสอบ",
  VERIFIED: "ตรวจสอบแล้ว",
  REUPLOAD_REQUIRED: "ขอหลักฐานใหม่",
  REJECTED: "ปฏิเสธการตรวจสอบ",
};
export const permissions = [
  "leaves.view_all",
  "leaves.view_assigned",
  "leaves.edit",
  "evidence.precheck",
  "evidence.final_review",
  "evidence.reject",
  "evidence.request_reupload",
  "employees.manage",
  "mentors.assign",
  "users.manage",
  "permissions.manage",
  "audit.view",
  "settings.manage",
  "data.clear",
] as const;
export type Permission = (typeof permissions)[number];
export type Role = "CENTER_HEAD" | "HR" | "MENTOR";
export type Profile = {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  discord_user_id: string | null;
  permissions: Permission[];
};
export const defaultPermissions: Record<Role, readonly Permission[]> = {
  CENTER_HEAD: permissions,
  HR: [
    "leaves.view_all",
    "evidence.final_review",
    "evidence.reject",
    "evidence.request_reupload",
  ],
  MENTOR: [
    "leaves.view_assigned",
    "leaves.edit",
    "evidence.precheck",
    "evidence.request_reupload",
  ],
};
export function can(profile: Profile, permission: Permission) {
  return profile.active && profile.permissions.includes(permission);
}
export const reviewSchema = z
  .object({
    action: z.enum(["precheck", "verify", "reupload", "reject"]),
    version: z.number().int().positive(),
    reason: z.string().trim().max(2000).default(""),
    rejection_type: z.enum(["EVIDENCE", "LEAVE_DATA"]).optional(),
  })
  .superRefine((v, c) => {
    if (["reupload", "reject"].includes(v.action) && !v.reason)
      c.addIssue({ code: "custom", path: ["reason"], message: "กรุณาระบุเหตุผล" });
    if (v.action === "reject" && !v.rejection_type)
      c.addIssue({
        code: "custom",
        path: ["rejection_type"],
        message: "กรุณาเลือกประเภทการปฏิเสธ",
      });
  });
export function assertTransition(
  status: Status,
  action: string,
  profile: Profile,
) {
  const needed: Record<string, Permission> = {
    precheck: "evidence.precheck",
    verify: "evidence.final_review",
    reupload: "evidence.request_reupload",
    reject: "evidence.reject",
  };
  if (
    !needed[action] ||
    !can(profile, needed[action]) ||
    (profile.role === "MENTOR" && ["verify", "reject"].includes(action))
  )
    throw new Error("ไม่มีสิทธิ์ดำเนินการ");
  if (
    (action === "precheck" && status !== "WAITING_MENTOR_REVIEW") ||
    (["verify", "reject"].includes(action) &&
      status !== "WAITING_FINAL_REVIEW") ||
    (action === "reupload" &&
      !["WAITING_MENTOR_REVIEW", "WAITING_FINAL_REVIEW"].includes(status))
  )
    throw new Error("สถานะไม่อนุญาตให้ดำเนินการนี้");
}
export const employeeSchema = z.object({
  id: z.uuid().optional(),
  code: z
    .string()
    .trim()
    .regex(/^\d{3,12}$/),
  name: z.string().trim().min(2).max(160),
  department_id: z.uuid(),
  mentor_id: z.uuid().nullable(),
  active: z.boolean().default(true),
});
export const correctionSchema = z.object({
  version: z.number().int().positive(),
  leave_date: z.iso.date(),
  leave_type: z.string().min(1).max(60),
  period: z.enum(["FULL", "AM", "PM"]),
  reason: z.string().trim().min(1).max(2000),
  correction_reason: z.string().trim().min(1).max(2000),
});
export type Leave = {
  id: string;
  document_number: string;
  employee_id: string;
  mentor_id: string | null;
  status: Status;
  assignment_status: string;
  leave_type: string;
  leave_date: string;
  period: string;
  reason: string;
  version: number;
  created_at: string;
  employees: {
    code: string;
    name: string;
    departments: { name: string } | null;
  } | null;
};
