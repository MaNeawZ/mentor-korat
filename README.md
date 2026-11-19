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
# setup:storage ใช้เฉพาะระบบเดิมที่ต้องสร้าง bucket สำหรับรูปเก่า
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
- `/notifications`: อ่านรายการของตน / อ่านทั้งหมด และกระดิ่ง (poll ทุก 5 วินาทีเมื่อแท็บเปิดอยู่; refresh ข้อมูลเมื่อมีแจ้งเตือนเปลี่ยน และมี fallback ทุก 60 วินาที)
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
| `GET /api/evidence/[id]` | RLS ก่อน proxy รูปจาก Discord หรือ private Storage รุ่นเก่า; no-store |
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

## ล้างรายการทดสอบจากหน้าตั้งค่า

หัวหน้าศูนย์ที่มีสิทธิ์ `data.clear` เปิด **ตั้งค่าระบบ → ล้างข้อมูลใบลา → ตรวจสอบข้อมูลก่อนล้าง** ระบบแสดงจำนวนข้อมูลทั้งหมด ต้องระบุเหตุผล ยอมรับขอบเขต และพิมพ์ `ล้างข้อมูลใบลา` ก่อนยืนยัน ไม่มีแท็กแยกรายการทดสอบ จึงลบใบลาทั้งหมดพร้อมหลักฐาน ลิงก์อัปโหลด ประวัติตรวจใบลา ข้อความ LINE คิว และแจ้งเตือนในเว็บ หากข้อมูลเปลี่ยนหรือ worker กำลังทำงาน ระบบให้ตรวจสอบใหม่

เก็บพนักงาน แผนก Mentor บัญชี/สิทธิ์ การตั้งค่า กลุ่ม LINE และ audit ไว้ ไม่แตะ `public` หรือ Supabase Auth ข้อความแจ้งสถานะ Discord ยังอยู่ แต่ข้อความแนบรูปหลักฐานใหม่จะลบผ่านคิวตาม reference รูปเก่าใน bucket `mentor-korat-evidence` ลบเฉพาะ path ที่บันทึกไว้ มีสถานะค้างและปุ่มลองใหม่เมื่อครบจำนวน retry รหัส event LINE ขั้นต่ำถูกเก็บเพื่อกัน redelivery สร้างรายการเดิมกลับมา

ก่อนใช้งานครั้งแรก ติดตั้ง migration `202611140001_clear_leave_data.sql` ตาม [DEPLOYMENT.md](DEPLOYMENT.md) การติดตั้งเพิ่มฟังก์ชันเท่านั้น ยังไม่ล้างข้อมูลจนกดปุ่มยืนยัน

ติดตั้ง patch `202611140002_clear_data_safeupdate.sql` ด้วยเพื่อรองรับ safeupdate ของ Supabase API หากเคยติดตั้งตัวแรกแล้วให้รันเฉพาะ patch นี้ หรือใช้ SQL Editor bundle ฉบับล่าสุดที่ข้าม migration เดิมโดยตรวจ checksum

หากต้องการล้าง **ประวัติการดำเนินการ** เพิ่มเติม ให้ใช้ปุ่ม **ล้างประวัติเก่าทั้งหมด** ในหน้าประวัติหรือหน้าตั้งค่า (migration `202611140003_clear_audit_history.sql`) แสดงจำนวนก่อนยืนยัน ต้องพิมพ์ `ล้างประวัติการดำเนินการ` พร้อมเหตุผล ปุ่มนี้ลบ audit เก่าทั้งหมด รวมการแก้พนักงานและการตั้งค่า และบันทึกการล้างครั้งล่าสุดไว้ 1 รายการ ไม่ลบข้อมูลใบลา/พนักงาน/การตั้งค่าปัจจุบัน ประวัติจากการทำงานครั้งใหม่หลังล้างจะถูกบันทึกตามปกติ

## รูปหลักฐานใน Discord

รูปใหม่ทุกไฟล์ที่พนักงานอัปโหลดผ่านลิงก์จะถูกย่อ/แปลง WebP แล้วแนบในห้อง Discord โดยตรง ไม่เขียนไฟล์เข้า Supabase Storage ฐานข้อมูลเก็บเฉพาะ metadata และ IDs ของข้อความ/attachment เปิดดูจากหน้าใบลาได้ผ่าน API ที่ตรวจสิทธิ์ก่อน รูปเก่าใน Supabase ยังอ่านได้และไม่ถูกย้ายหรือลบอัตโนมัติ ต้องติดตั้ง `202611140004_discord_evidence.sql` ก่อน deploy เวอร์ชันนี้ ใช้ `DISCORD_WEBHOOK_URL` เดิม ไม่ต้องใช้ bot token หากข้อความแนบรูปถูกลบหรือ webhook เดิมใช้ไม่ได้ รูปนั้นจะเปิดจากเว็บไม่ได้

## ยกเลิกข้อความ LINE แล้วส่งใบลาแก้ไขใหม่

หลังติดตั้ง `202611150001_line_unsend_corrections.sql` และ deploy รุ่นใหม่ ระบบรับ unsend webhook ผูกกับ message ID ของข้อความต้นทาง ปิดลิงก์เก่าและขึ้นข้อความเตือนในเว็บ/Discord พร้อมแท็ก Mentor เมื่อส่งเลขใบลาเดิมใหม่ จะอัปเดตรายการเดิมและออกลิงก์ใหม่อัตโนมัติเฉพาะสถานะรออัปโหลดที่ไม่เคยมีหลักฐานหรือผ่านการตรวจ และยืนยันรหัสพนักงาน ผู้ส่ง LINE กลุ่มเดิม และเวลาข้อความใหม่ได้ ไม่เพิ่มใบลาซ้ำ หาก webhook ยกเลิกมาช้ากว่าข้อความแก้ไข ระบบลองประมวลผลข้อความซ้ำที่ตรงกันใหม่ภายใต้เงื่อนไขเดียวกัน

รายการมีหลักฐาน/ผ่านการตรวจ/เปลี่ยนพนักงาน/ยืนยันผู้ส่งไม่ได้ ให้หัวหน้าตรวจที่ ตั้งค่า → LINE และเปิดใบลาเดิมเพื่อแก้ข้อมูลพร้อมเหตุผล รายการปิดแล้วไม่เปิดหรือแก้อัตโนมัติ เก็บหลักฐานและประวัติธุรกิจไว้ ข้อความต้นฉบับที่ถูกยกเลิกถูกแทนที่ด้วย placeholder และข้อความผิดที่ยกเลิกแล้วถูกซ่อนจากรายการตรวจสอบ การแจ้ง Discord ครั้งก่อนอาจมีผู้เห็นแล้ว ให้ใช้ข้อมูลล่าสุดจากใบลา ระบบเก่าที่ไม่ได้เก็บ user ID หรือไม่เคยรับ unsend ก่อนติดตั้งต้องตรวจด้วยหัวหน้า ไม่เดาหรือแก้ประวัติย้อนหลังเอง

## รหัสพนักงาน

รหัสพนักงานใช้ได้ทั้งตัวเลขและตัวอักษรอังกฤษ 3–12 ตัว เช่น `OLS768563` ระบบจัดเป็นตัวพิมพ์ใหญ่ก่อนบันทึกและก่อนจับคู่ข้อความ LINE ต้องติดตั้ง migration `202611160001_alphanumeric_employee_codes.sql` เพิ่มเมื่ออัปเดตจากรุ่นที่รับเฉพาะตัวเลข

## นำเข้าพนักงาน CSV

หน้า **พนักงาน → นำเข้าพนักงาน CSV** อัปโหลด CSV แบบ UTF-8 แล้วตรวจตัวอย่างก่อนยืนยัน รองรับไฟล์ `app_employees_rows.csv` โดยใช้ `id` เป็นรหัส รวม `first_name` กับ `last_name` เป็นชื่อ ใช้ `position_name` (หรือ `position`) เป็นแผนกของแต่ละคน และแปลง `status=resigned` หรือ `inactive` เป็นปิดใช้งาน หรือใช้หัวตาราง `code,name,position,active` ได้ (สถานะว่างถือว่าใช้งาน) นำเข้าได้สูงสุด 2 MB / 2,000 คนต่อครั้ง

ผู้ใช้ต้องมีสิทธิ์ `employees.manage` รหัสซ้ำในไฟล์หรือข้อมูลผิดจะหยุดก่อนบันทึก รหัสที่มีในระบบแล้วจะถูกข้ามโดยไม่แก้ข้อมูลเดิม ใช้แผนกชื่อเดียวกันที่มีอยู่หรือสร้างแผนกใหม่อัตโนมัติ โดยตัดช่องว่างหัวท้าย หากไฟล์มีคอลัมน์ตำแหน่งต้องกรอกทุกแถว (1–80 ตัวอักษร) หากไม่มีคอลัมน์ตำแหน่งจึงเลือกแผนกเองได้ พนักงานใหม่ยังไม่มอบหมาย Mentor ชื่อเล่นและวันที่จะไม่ถูกบันทึก การบันทึกพนักงาน แผนก และ audit log เป็น transaction เดียวพร้อมรายงานจำนวนเพิ่ม/ข้ามหลังสำเร็จ

ติดตั้ง migration `202611190003_import_employee_positions.sql` ก่อนใช้ (คง RPC เดิมไว้สำหรับเวอร์ชันเก่า) หรือรัน `supabase/setup-sql-editor.sql` ฉบับล่าสุดตาม [DEPLOYMENT.md](DEPLOYMENT.md)

## ลบพนักงาน

ผู้มีสิทธิ์ `employees.manage` ใช้ปุ่ม **ลบ** ในแต่ละแถว หรือเลือกหลายคนด้วยช่องทำเครื่องหมายแล้วกด **ลบพนักงานที่เลือก** เลือกทั้งหมดได้เฉพาะหน้าปัจจุบัน หน้ายืนยันแสดงรหัสและชื่อก่อนลบถาวร หากมีพนักงานที่มีประวัติใบลาในชุดที่เลือก ระบบจะไม่ลบทั้งชุด ให้เอาคนนั้นออกจากรายการที่เลือก หรือปิดใช้งานผ่าน **แก้ไข** การลบเก็บข้อมูลเดิมใน audit log

ติดตั้ง migration `202611190002_delete_employees.sql` หรือ SQL Editor bundle ฉบับล่าสุดก่อนใช้

## External scheduler

ไม่มี cron ใน Vercel config แล้ว เมื่อรับข้อความ LINE จะบันทึก event อย่างทนทาน จากนั้นอ่านข้อมูลและเรียก transaction สร้างใบลา/แจ้งเตือนเว็บ/Discord outbox ก่อนตอบ LINE (fast path ไม่เกิน 5 events และมี budget 1.5 วินาที ไม่ใช่ latency ที่รับประกัน) Discord ส่งต่อทันทีหลัง response ผ่าน Next.js after() งานที่ช้าหรือขัดข้องยังอยู่ในคิวและมี GitHub schedule เป็น fallback: ตั้ง GitHub repository secrets `WORKER_BASE_URL` และ `CRON_SECRET` (ตรงกับ Vercel) รอบ fallback ทุก 5 นาทีเปิดเป็นค่าเริ่มต้น ไม่ต้องกด Re-run; push เปลี่ยน workflow/caller script บน main จะเรียกหนึ่งรอบ ตั้ง repository variable `WORKER_SCHEDULER_ENABLED=false` เมื่อต้องการหยุด fallback GitHub schedule อาจล่าช้าได้ รายละเอียดอยู่ใน DEPLOYMENT.md
