# Korat Leave Monitoring

ระบบติดตามการแจ้งลาผ่าน LINE และการตรวจหลักฐานโดย Mentor → หัวหน้าศูนย์ / HR ใช้ Next.js App Router, React, TypeScript strict, Tailwind, shadcn-style components/Radix, Supabase Auth/PostgreSQL/Storage และ Discord

**สถานะ: พัฒนา source และทดสอบในเครื่องแล้ว ยังไม่เชื่อมต่อ Supabase/LINE/Discord จริง และยังไม่ได้ deploy production** ดูหลักฐานการตรวจใน [VERIFICATION.md](VERIFICATION.md) การทดสอบฐานข้อมูลใช้ PostgreSQL ผ่าน PGlite แยกจากระบบจริง

## เริ่มใช้งาน

ใช้ Node.js 24 LTS และ npm บน Windows ใช้ `npm.cmd` หาก PowerShell ไม่อนุญาต `npm.ps1`

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# ใส่ค่า environment ใน .env.local ตามคำอธิบายด้านล่าง
node --env-file=.env.local scripts/migrate.mjs --check
node --env-file=.env.local scripts/migrate.mjs
npm.cmd run setup:storage
npm.cmd run bootstrap
npm.cmd run dev
```

เปิด http://localhost:3000 ต้องตั้งค่า Supabase และเพิ่มผู้ใช้ก่อนเข้าหน้าภายใน ไม่มี demo account และไม่มีข้อมูลพนักงานจำลอง ถ้ายังไม่ตั้งค่า หน้า login จะแสดงคำแนะนำโดยไม่เปิดข้อมูลภายใน

หากจำรหัสผ่านฐานข้อมูลไม่ได้และไม่ต้องการ reset ให้ใช้ `npm.cmd run migrations:export` แล้วนำ `supabase/setup-sql-editor.sql` ทั้งไฟล์ไปรันผ่าน Supabase SQL Editor แทน migration command ดูขั้นตอนใน DEPLOYMENT.md วิธีนี้ไม่ต้องใช้ SUPABASE_MIGRATION_DATABASE_URL สำหรับการติดตั้งด้วยมือ

## Environment

| ตัวแปร | การใช้งาน |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL ของ Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key สำหรับ session client |
| `SUPABASE_SERVICE_ROLE_KEY` | เฉพาะ server: webhook, queue, upload และ storage |
| `NEXT_PUBLIC_APP_URL` | Origin จริง เช่น `https://leave.example.com` ห้ามลงท้ายด้วย path ใช้ตรวจ Origin และสร้างลิงก์ |
| `UPLOAD_TOKEN_SECRET` | secret สุ่มอย่างน้อย 32 ตัวอักษร เก็บถาวร ใช้กู้คืนลิงก์สำหรับ Mentor ห้ามเปลี่ยนโดยไม่วางแผนหมุน token |
| `LINE_CHANNEL_SECRET` | ตรวจ HMAC ของ raw webhook body |
| `LINE_CHANNEL_ACCESS_TOKEN` | เตรียมไว้สำหรับตรวจข้อมูลกลุ่มผ่าน LINE API; workflow หลักไม่ส่งข้อความกลับ LINE |
| `DISCORD_WEBHOOK_URL` | webhook ของช่องส่วนตัวที่อนุญาตให้อ่านเหตุผลการลา |
| `DISCORD_BOT_TOKEN` | optional: ส่ง upload link ใน DM ให้ Mentor |
| `DISCORD_GUILD_ID` | optional: ระบุ server สำหรับการตั้งค่า mapping; ไม่จำเป็นสำหรับ webhook/DM |
| `CRON_SECRET` | ตรวจสิทธิ์เรียก worker สุ่มอย่างน้อย 32 ตัวอักษร |
| `WORKER_BASE_URL` | GitHub repository secret: origin จริงของแอปสำหรับ external scheduler |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | optional GitHub secret สำหรับเรียก deployment ที่มี protection |
| `SUPABASE_MIGRATION_DATABASE_URL` | PostgreSQL connection ของ migration runner ใช้ direct/session pooler ไม่ใช้ transaction pooler |
| `BOOTSTRAP_USER_ID`, `BOOTSTRAP_USER_NAME` | สร้างหัวหน้าศูนย์คนแรกจากบัญชี Supabase Auth ที่มีอยู่ ใช้ครั้งเดียวแล้วนำออก |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub production environment secrets |

สร้าง secret ได้ด้วย `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))"` เก็บใน secret manager ห้าม commit `.env.local` ไม่ต้องใช้ `TEST_DATABASE_URL`: tests สร้างฐานข้อมูลในหน่วยความจำเอง

## หน้าจอ

- `/login`, `/forgot-password`, `/reset-password`: Email/password และ recovery ผ่าน Supabase
- `/dashboard`: ยอดรวมและสถานะตาม RLS, รายการล่าสุด, quick actions
- `/leaves`: ค้นหา กรองสถานะ แผนก Mentor วันที่ เรียงลำดับ และแบ่งหน้า
- `/leaves/[id]`: ข้อมูลต้นฉบับ หลักฐานทุกเวอร์ชัน ลิงก์อัปโหลด การแก้ไข ประวัติ และการตรวจ
- `/mentor/tasks`, `/reviews`: งานของตนและงานรอตรวจขั้นสุดท้าย
- `/employees`, `/mentors`, `/assignments/unassigned`: ข้อมูลทีม เพิ่มแผนก และมอบหมายหลายคนพร้อมกันในหน้าที่เลือก
- `/notifications`: อ่านรายการของตน / อ่านทั้งหมด และกระดิ่ง (poll ทุก 15 วินาทีเมื่อแท็บเปิดอยู่; refresh ข้อมูลเมื่อมีแจ้งเตือนเปลี่ยน และมี fallback ทุก 60 วินาที)
- `/settings`, `/settings/users`, `/settings/permissions`, `/settings/line`, `/settings/discord`: การตั้งค่า บัญชี สิทธิ์ กลุ่มที่อนุญาต และสถานะคิว
- `/audit-logs`: ประวัติผู้ดำเนินการและข้อมูลก่อน/หลัง
- `/upload/[token]`: ไม่ต้อง login เลือกรูป/ถ่ายรูป Preview บีบอัด และส่งหลักฐาน

## โครงสร้าง

```text
src/app/                    Next.js pages, layouts, Route Handlers
src/components/             หน้าใช้งาน, layout, forms, Radix UI components
src/lib/domain.ts           Validation และ workflow policy
src/lib/auth.ts             Server-verified identity และ permission helpers
src/lib/repository.ts       Queries, filters, server-side pagination
src/lib/supabase/           Session client และ server-only service client
src/lib/line/               Deterministic Thai leave parser
src/lib/worker.ts           Durable LINE processing และ Discord delivery
src/lib/security.ts        HMAC, token hashing, MIME signatures
supabase/migrations/        SQL ระบุ mentor_korat ชัดเจน
scripts/                    Migration runner, storage setup, bootstrap
tests/                      Unit, HTTP boundary และ PostgreSQL/RLS integration
.github/workflows/          CI และ migration → build → deploy → health check
```

## ตารางฐานข้อมูล

ทั้งหมดอยู่ใน `mentor_korat`: `departments`, `employees`, `app_users`, `permissions`, `role_permissions`, `user_permission_overrides`, `line_groups`, `app_settings`, `integration_events`, `leave_requests`, `leave_raw_messages`, `leave_parsing_issues`, `leave_status_history`, `evidence_upload_tokens`, `evidence_files`, `notifications`, `discord_messages`, `notification_outbox`, `audit_logs`, `rate_limits`, `schema_migrations`

ปรับ normalization จากข้อเสนอเดิม: role เป็นค่าที่ตรวจด้วย CHECK และใช้ `role_permissions`; Mentor คือ `app_users` ที่มี role `MENTOR`; assignment ปัจจุบันอยู่ที่ employee/leave ส่วนประวัติอยู่ใน audit; review/comment/rejection อยู่ใน `leave_status_history` ไม่มีตารางซ้ำเพื่อข้อมูลชุดเดียวกัน

## API

| Endpoint | สิทธิ์ / หน้าที่ |
|---|---|
| `POST /api/auth/{login,logout,forgot,reset}` | Session auth, Origin validation, login/recovery rate limit |
| `GET /auth/callback` | PKCE code exchange; allowlist redirect |
| `POST /api/webhooks/line` | Raw-body HMAC, group allowlist, durable idempotent enqueue |
| `GET /api/cron/process` | Bearer CRON_SECRET; LINE/Discord workers |
| `POST /api/leaves/[id]/{link,review,correct}` | Server identity + RLS; RPC ตรวจ permission/version/สถานะซ้ำ |
| `GET /api/evidence/[id]` | RLS ก่อนอ่าน private Storage; no-store |
| `POST /api/upload/[token]` | ไม่ต้อง login; hashed token + MIME/magic bytes + decode + atomic consume |
| `POST /api/manage/{employee,assignment,user,permission,department,line_group,setting}` | Zod + permission + transactional RPC |
| `GET/POST /api/notifications` | เฉพาะผู้รับ; POST อ่านหนึ่งรายการหรือทั้งหมด |
| `POST /api/integrations/discord/test` | settings.manage และ rate limit |
| `POST /api/queues/retry` | settings.manage; retry เฉพาะ FAILED; audit |
| `GET /api/health` | ตรวจการอ่าน schema; 503 หากยังไม่พร้อม ไม่เปิดเผย secrets |

## คำสั่งตรวจสอบ

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run migrations:check
npm.cmd run build
npm.cmd run test:browser
npm.cmd audit --omit=dev
```

ดู [DEPLOYMENT.md](DEPLOYMENT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [VERIFICATION.md](VERIFICATION.md) และ [ACCEPTANCE.md](ACCEPTANCE.md) ก่อนใช้งานจริง

## External scheduler

ไม่มี cron ใน Vercel config แล้ว ข้อความ LINE ที่บันทึกเข้าคิวจะปลุก worker ผ่าน Next.js after() หลังส่ง HTTP response เพื่อเริ่มประมวลผลทันที ใช้ GitHub schedule เป็น fallback สำหรับ retry/งานค้าง: หลัง deploy ตั้ง GitHub repository secrets `WORKER_BASE_URL` และ `CRON_SECRET` (ตรงกับ Vercel) → Actions → **Process Worker** → Run workflow เพื่อทดสอบ → ตั้ง repository variable `WORKER_SCHEDULER_ENABLED=true` เพื่อเปิด fallback ทุก 5 นาที GitHub schedule อาจล่าช้าได้ หากต้องการ retry ถี่ทุก 1 นาที ใช้ scheduler ภายนอกเรียก endpoint เดิมพร้อม Authorization header แทน รายละเอียดและ Deployment Protection อยู่ใน DEPLOYMENT.md
