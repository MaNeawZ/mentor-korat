# ผลการตรวจสอบจริง

ตรวจเมื่อ **13 พฤศจิกายน 2569 (2026), Asia/Bangkok** ใน workspace `C:\Code\github\mentor-korat`

## ผลที่รันแล้ว

| Check | ผล |
|---|---|
| `npm run lint` | ผ่าน ไม่มี error/warning |
| `npm run typecheck` | ผ่าน TypeScript strict |
| `npm test` | ผ่าน 80 tests / 7 files หลังเพิ่ม SQL Editor export, external scheduler และ immediate worker wake |
| `npm run migrations:check` | ผ่าน 3 migrations พร้อม checksum |
| `npm run build` | ผ่าน Next.js 16.4.6 production build |
| `npm run test:browser` | ผ่าน 8 tests บน production server ที่รันในเครื่อง |
| `npm audit --omit=dev` | ไม่พบ vulnerabilities ใน production dependencies |

Environment ที่ใช้ตรวจ: Windows, Node.js 22.12.0, npm 10.4.0 มี engine warning สำหรับเครื่องนี้เพราะ dependency lint บางตัวต้องการ Node ≥22.13 แนะนำ Node 24 สำหรับติดตั้งใหม่และตั้ง CI เป็น Node 24 แล้ว ไม่ได้อ้างว่ารัน GitHub Actions จริง

## Tests ครอบคลุมอะไร

`domain.test.ts`: Thai/BE date และ leap date validation, sample LINE message, missing fields, configurable leave types, raw-body signature, secure random token/hash/recovery, MIME signature, workflow permissions, disabled user, HR overrides และ safe Discord mentions

`database.test.ts`: รัน SQL migrations จริงบน isolated PostgreSQL ผ่าน PGlite สร้าง auth/roles จำลองเฉพาะในฐานข้อมูลทดสอบ ตรวจ RLS isolation, anonymous denied, service-only functions, event idempotency, transactional upload/rollback, used/revoked token, concurrent completion, version conflicts รวม NULL version, mandatory reasons, Mentor final-review denial, HR final review, audit/outbox, disabled user, permission override, assignment, unassigned alerts, raw-message mutation denial และ invalid employee issue

`api.test.ts`: signature ก่อน DB, LINE verify empty events, กลุ่มไม่อนุญาตไม่ถูก enqueue, group discovery แบบ inactive, idempotent enqueue settings, anonymous review/evidence denial, Origin checks, permission checks, bounded stream และ migration guards/checksums

`upload.test.ts`: decode/normalize รูปจริงด้วย sharp, ปฏิเสธ MIME spoof และ oversized file, Storage failure ไม่ consume token, cleanup เมื่อ token race แพ้ และไม่ลบไฟล์เมื่อผล transaction ไม่แน่นอนจาก network

`browser-tests/public.spec.ts`: ใช้ Playwright กับ Microsoft Edge แบบ headless ทดสอบ desktop 1280×720 และ Pixel 7 emulation ทั้งสองแบบ:

- Login อ่านได้และไม่มี horizontal overflow
- ปุ่ม login ปิดเมื่อยังไม่ตั้งค่า Supabase; show/hide password ทำงาน
- ผู้ที่ยังไม่ login ถูก redirect จาก dashboard; เข้าหน้า recovery ได้
- Invalid upload link แสดงข้อความที่ไม่เปิดเผยข้อมูลส่วนตัว
- System dark mode เปลี่ยน theme ถูกต้องและไม่เกิด page error

บันทึกและตรวจภาพ `test-results/login-desktop.png`, `login-mobile.png`, `login-dark-desktop.png`, `login-dark-mobile.png` โฟลเดอร์นี้เป็น local artifact และอยู่ใน .gitignore ไม่มีข้อมูลพนักงานจริง

Browser preview / Computer Use ในแอปเปิดไม่ได้จาก kernel asset path ของ environment จึงใช้ automated browser tests กับ Edge ที่ติดตั้งอยู่แทน ผล browser ข้างต้นมาจากการรันจริง ไม่ได้อ้างจากการดู source

## สิ่งที่ยังไม่ได้ทดสอบ / ไม่ได้ดำเนินการ

การแก้ไข external scheduler: ถอด `crons` จาก vercel.json, เพิ่ม GitHub workflow ทุก 5 นาที เปิดเป็นค่าเริ่มต้นและเรียกรอบแรกเมื่อ push เปลี่ยน workflow/caller บน main (ตั้ง repository variable=false เพื่อหยุดได้) เพิ่ม caller script ที่ส่ง bearer header โดยไม่ตาม redirect ทดสอบ 13 กรณีสำหรับ caller/config/auth/error handling ด้วย mocked HTTP แล้ว รวมทั้ง lint/typecheck/production build ผ่าน ตรวจ YAML และเงื่อนไข unset/true/false/manual override แล้ว ทดสอบเพิ่มเติมการ export SQL Editor 2 กรณีรันบน PGlite และรวมอยู่ในยอด tests ข้างต้น

การลดความหน่วง: webhook ที่บันทึก event สำเร็จปลุก worker ผ่าน Next.js after() หลัง response, drain สูงสุด 5 batches และใช้ scheduler กู้คืนงานค้าง การอัปโหลด/ตรวจ/มอบหมาย/retry ก็ปลุก worker หลัง commit ทดสอบ defer-until-after-response, burst draining, batch/time bounds, sanitized failure, enqueue failure ไม่ปลุก worker และ SQL ingestion ของพนักงานสองคน/ชื่อไม่ตรง/เลขใบลาซ้ำแล้ว กระดิ่ง polling 15 วินาทีพร้อม dedup และ fallback refresh 60 วินาที ยังไม่ได้วัด latency ของการแก้ไขนี้บน production หลัง deploy

- ไม่รัน migration ใน Supabase project จริง และไม่เปลี่ยนข้อมูล/schema `public` ใด ๆ ของผู้ใช้
- ยังไม่มี credentials จึงไม่ได้ทดสอบ Supabase Auth/SMTP/PostgREST/Storage policies บน project จริง
- ไม่ส่งข้อความจริงผ่าน LINE/Discord และไม่สร้างบัญชี/กลุ่ม/channel ภายนอก
- ไม่ push source, ไม่สร้าง remote branches, ไม่รัน GitHub Actions และไม่ deploy Vercel
- หน้าภายใน authenticated dashboard/detail/management ผ่าน compile/type checks แต่ยังไม่ได้ browser QA ด้วยบัญชีจริง
- ไม่วัด Core Web Vitals หรือ API/database p95 บน infrastructure จริง ค่าใน ARCHITECTURE.md เป็น performance budgets เท่านั้น
- การตรวจ dependency ทั้งชุดยังมี moderate advisories ของ development tooling 8 รายการ; ผล 0 vulnerabilities ที่กล่าวข้างต้นจำกัด production dependencies
- PGlite ใช้ PostgreSQL engine จริงแต่ไม่แทน managed Supabase, Storage API หรือการทดสอบ distributed concurrency บน provider จริง

ต้องตั้งค่า [DEPLOYMENT.md](DEPLOYMENT.md) และผ่าน [ACCEPTANCE.md](ACCEPTANCE.md) ก่อนประกาศพร้อม production
