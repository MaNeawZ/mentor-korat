# ผลการตรวจสอบจริง

ตรวจเมื่อ **13 พฤศจิกายน 2569 (2026), Asia/Bangkok** ใน workspace `C:\Code\github\mentor-korat`

## ผลที่รันแล้ว

| Check | ผล |
|---|---|
| `npm run lint` | ผ่าน ไม่มี error/warning |
| `npm run typecheck` | ผ่าน TypeScript strict |
| `npm test` | ผ่าน 93 tests / 10 files หลังเพิ่ม inline LINE ingestion และ Discord delivery tests |
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

รองรับรหัสพนักงาน alphanumeric เช่น OLS768563: ผ่าน 187 tests ใน 16 ไฟล์ รวม lint/typecheck/build และ migration check 9 ไฟล์ ตรวจ Zod และ LINE parser normalize ASCII code เป็น uppercase, รหัสตัวเลขยังใช้ได้, ไม่รับช่องว่าง/ขีด/Unicode ที่อาจ normalize ชนกัน และไม่จับ English heading แทนแถวรหัสที่มีตัวเลข ทดสอบ manage_entity สร้างพนักงาน OLS และ ingest ใบลาจริงบน PGlite ภายใน transaction ทดสอบแยก รักษาข้อมูล numeric เดิมและปฏิเสธ code ผิดรูปแบบ Migration ใหม่แทนที่เฉพาะ own employee_code_format CHECK แบบ atomic โดย guard ยกเว้นเฉพาะ statement เต็มที่ตรวจแล้วพร้อม hash เท่านั้น ยังปฏิเสธการถอด constraint อย่างเดียวและ DROP อื่น ไม่ได้ติดตั้ง migration หรือเพิ่มพนักงานจริงบน production

ปรับ UX/UI การแจ้งเตือนเว็บและ Discord: ผ่าน unit/integration 170 ข้อ พร้อม lint/typecheck/production build ตรวจภาพ local component preview ด้วย Edge/Playwright บน desktop 1280px, mobile 390px และ mobile dark ตรวจไม่ล้นจอ, Escape/outside-click dismissal/focus return, อ่านทั้งหมดสำเร็จ และ failure ไม่ทำให้ unread count หาย ไม่มี pageerror ทั้ง 3 layouts บันทึก `test-results/notifications-*.png` เป็นภาพข้อมูลจำลอง รวมภาพจำลองการ์ด Discord จาก payload จริง ไม่ใช่ screenshot ของ Discord production ทดสอบ browser โดย mock notifications HTTP เท่านั้นและไม่ส่งข้อความจริง รูต preview และสคริปต์ทดสอบชั่วคราวถูกนำออกก่อน build ไม่มี migration ใหม่ ข้อมูลประกอบ notification อ่านด้วย session client/RLS ส่วน Discord คง allowed_mentions, active upload link, status/correction event และ retry behavior เดิม

รองรับ LINE unsend + ส่งข้อความแก้ไขเลขใบลาเดิม: ผ่าน 170 tests ใน 16 ไฟล์ รวม lint/typecheck/build และ migration check 8 ไฟล์ ทดสอบ signed active-group webhook/retained sender, unsend ไม่พึ่ง leave-type configuration, SQL redaction/revoke/tombstone/replacement same leave ID/new link/notifications/audit, webhook สลับลำดับ, redelivery/old-unsend ไม่กระทบ revision ใหม่, duplicate ปกติยังถูกปฏิเสธ, different sender/group/employee/old timestamp/legacy missing sender ไม่ทับอัตโนมัติ, มีหลักฐาน/VERIFIED คงข้อมูล, DB กัน review ระหว่าง retracted, head-only manual acknowledgement/new token โดยไม่ลง nonce/hash ใน audit และ Discord tag แจ้ง LINE_UNSENT/LINE_CORRECTED แม้สถานะหลักฐานไม่เปลี่ยน ใช้ PGlite/mocked providers ไม่ได้ unsend ข้อความ LINE จริง ไม่แก้ใบลาจริง และไม่ได้ติดตั้ง migration `202611150001_line_unsend_corrections.sql` บน production

แก้กรณี Discord ส่งรูปสำเร็จแต่เว็บแจ้งข้อมูลไฟล์ไม่ครบ: โค้ดเดิมอ่าน attachments เท่านั้น ขณะที่ [Discord Message Object](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx) แยกไฟล์ที่อ้างใน embed ออกไป แก้ทั้ง send/read ให้รองรับ embedded CDN/proxy URL โดยคง HTTPS/hostname/channel/attachment ID checks และส่งรูปใหม่เป็น normal attachment ทดสอบ normal/embedded/normalized filename/ambiguous attachment/external URL เพิ่ม รวมผ่าน 152 tests ใน 15 ไฟล์ พร้อม lint/typecheck/build ไม่เปลี่ยน schema ตรวจ GET ข้อความ Discord และอ่านข้อมูลใบลา LE-256911003473 แบบ read-only ตามลิงก์ที่ผู้ใช้ส่ง พบ attachments=[] และไฟล์ WebP อ่านได้จาก embeds ส่วนใบลายัง WAITING_EVIDENCE ไม่มี evidence metadata การผูกหลักฐานจริงต้องได้รับคำตอบอนุมัติแยกจากการตรวจแบบ read-only; ไม่อ้างว่าการอ่านสำเร็จเท่ากับบันทึกใบลาสำเร็จ

เปลี่ยนไฟล์หลักฐานใหม่ทุกไฟล์เป็น Discord attachment ตามคำขอผู้ใช้: ผ่าน 148 tests ใน 15 ไฟล์ รวม lint/typecheck/build และ migration check 7 ไฟล์ ทดสอบ multipart/preview, normalize WebP, ไม่มี Supabase Storage writes, migration readiness, SQL consume token/status/audit/outbox atomic และ rollback/concurrent rejection, ไม่ลบไฟล์เมื่อผล commit คลุมเครือทั้ง thrown/returned transport errors, cleanup queue แยก provider, อ่านรูปหลัง Auth/RLS, refresh signed CDN URL/hostname+path/redirect/byte bounds, legacy Storage read, Unknown Message cleanup idempotency และไม่ถือว่า Unknown Webhook คือไฟล์ถูกลบ Migration `202611140004_discord_evidence.sql` เพิ่ม metadata provider/IDs เท่านั้น ไม่มีไฟล์ binary หรือ signed URL ใน DB ไม่ย้ายหรือลบรูปเก่าอัตโนมัติ การทดสอบใช้ PGlite/mocked Discord เท่านั้น ไม่ส่งไฟล์จริง ไม่ติดตั้ง migration บน production และต้อง smoke test upload/read/reupload/clear บน provider จริงหลัง deploy

แจ้งเปลี่ยนสถานะและแท็ก Mentor ใน Discord: ผ่าน 128 tests ใน 13 ไฟล์ รวมทั้ง lint/typecheck/build ทดสอบ edit mode PATCH การ์ดสถานะล่าสุดแล้ว POST ข้อความใหม่พร้อม mention สำหรับทั้ง 5 สถานะหลังสร้างใบลา, คง mapping การ์ดเดิม, events mode ส่งครั้งเดียว, งานล่าช้าแยกสถานะ event กับปัจจุบัน, POST ล้มเหลวคงคิว, PATCH 404 สร้างการ์ดใหม่โดยไม่ส่ง notice ซ้ำ และ ID Mentor ไม่มี/ไม่ถูกต้องไม่สร้าง mention เดาเพิ่ม SQL integration ตรวจ outbox ทุกช่วงสถานะสำเร็จด้วย ไม่เปลี่ยน DB และไม่ได้ส่ง Discord จริงระหว่างพัฒนา การแจ้งเตือนบนอุปกรณ์ขึ้นกับ Discord settings ของผู้รับและยังต้อง smoke test หลัง deploy

แนบ active upload link ใน Discord embed ให้ Mentor ส่งต่อพนักงานตามคำขอผู้ใช้: ทดสอบ WAITING_EVIDENCE/REUPLOAD_REQUIRED โดยไม่ใช้ bot token, URL ตรงกับ token เดิม, ไม่ส่ง nonce, ไม่มีการ rotate เมื่อ retry, ลิงก์หายจาก PATCH หลังอัปโหลด และไม่แนบให้ event สถานะเก่าที่ใบลาปัจจุบัน verified แล้ว ผ่านรวม 118 tests ใน 13 ไฟล์ พร้อม lint/typecheck/build ไม่ต้องแก้ DB หรือเพิ่ม migration ไม่ได้ส่งข้อความจริงหรือย้อนอัปเดต Discord messages ที่ส่งสำเร็จไปแล้วระหว่างพัฒนา

เพิ่มการล้าง audit เก่าทั้งหมดตามขอบเขตที่ผู้ใช้เลือก: ปุ่มแยกในหน้าตั้งค่าและหน้าประวัติ ทดสอบ role/active/permission/anonymous, คำยืนยันเฉพาะ/เหตุผล, stale preview, การลบ audit เก่ารวมการจัดการพนักงานและการตั้งค่าโดยคงบันทึกการล้างใหม่ 1 รายการ และไม่ลบใบลา/ข้อมูลหลัก/Auth/public/คิวไฟล์หลักฐาน ผ่าน 113 tests ใน 13 ไฟล์ พร้อม lint/typecheck/build และ migration check 6 ไฟล์ ใช้ PGlite และ API mocks เท่านั้น ไม่ได้ล้างประวัติจริงหรือติดตั้ง migration `202611140003_clear_audit_history.sql` บน production และยังไม่ได้ตรวจ UI ใหม่ผ่าน authenticated production browser

แก้ความเข้ากันได้กับ safeupdate: เพิ่ม forward migration `202611140002_clear_data_safeupdate.sql` โดยคง checksum migration เดิม เปลี่ยน DELETE ทั้ง 10 ตารางให้มีเงื่อนไข primary key ภายใต้ preview/locks/permission guards เดิม และไม่ปิด safeupdate เพิ่มการทดสอบ effective function definition และ sanitized API diagnostics รวมทดสอบผ่าน 109 ข้อใน 13 ไฟล์ พร้อม lint/typecheck/build และ migration check 5 ไฟล์ PGlite ไม่ได้โหลด extension safeupdate จริง จึงยังต้องติดตั้ง patch และทดสอบผ่าน Supabase API บน production โดยเจ้าของระบบ ไม่ได้รันล้างข้อมูลจริงระหว่างแก้ไข Log 503 ที่ได้รับไม่มี SQLSTATE จึงยังยืนยัน root cause ของ production ไม่ได้

ฟีเจอร์ล้างรายการทดสอบจากหน้าตั้งค่า: ผ่าน lint, typecheck, production build, migration safety (4 migrations) และ unit/integration tests 107 ข้อใน 13 ไฟล์ ทดสอบใหม่ครอบคลุม role/permission/active/Origin, คำยืนยันและเหตุผล, snapshot เปลี่ยน, worker ยังถือ lease, การลบครบขอบเขตพร้อมเก็บ master data/public/Auth/audit, คิว exact evidence paths, event redelivery tombstones, Storage failure/backoff และ manual retry การทดสอบใช้ PGlite และ mocked Storage/HTTP เท่านั้น ไม่ได้เรียก clear-data บนข้อมูลจริง ไม่ได้ติดตั้ง migration ใหม่นี้บน Supabase จริง และยังไม่ได้ตรวจหน้าตั้งค่าใหม่ผ่าน browser ที่ login บน production

การแก้ไข external scheduler: ถอด `crons` จาก vercel.json, เพิ่ม GitHub workflow ทุก 5 นาที เปิดเป็นค่าเริ่มต้นและเรียกรอบแรกเมื่อ push เปลี่ยน workflow/caller บน main (ตั้ง repository variable=false เพื่อหยุดได้) เพิ่ม caller script ที่ส่ง bearer header โดยไม่ตาม redirect ทดสอบ 13 กรณีสำหรับ caller/config/auth/error handling ด้วย mocked HTTP แล้ว รวมทั้ง lint/typecheck/production build ผ่าน ตรวจ YAML และเงื่อนไข unset/true/false/manual override แล้ว ทดสอบเพิ่มเติมการ export SQL Editor 2 กรณีรันบน PGlite และรวมอยู่ในยอด tests ข้างต้น

การลดความหน่วง: webhook ที่บันทึก event สำเร็จปลุก worker ผ่าน Next.js after() หลัง response, drain สูงสุด 5 batches และใช้ scheduler กู้คืนงานค้าง การอัปโหลด/ตรวจ/มอบหมาย/retry ก็ปลุก worker หลัง commit ทดสอบ defer-until-after-response, burst draining, batch/time bounds, sanitized failure, enqueue failure ไม่ปลุก worker และ SQL ingestion ของพนักงานสองคน/ชื่อไม่ตรง/เลขใบลาซ้ำแล้ว กระดิ่ง polling 15 วินาทีพร้อม dedup และ fallback refresh 60 วินาที ยังไม่ได้วัด latency ของการแก้ไขนี้บน production หลัง deploy

ปรับเพิ่มการทำงานจาก LINE โดยตรง: หลังเก็บ event ในคิวแล้ว webhook เรียก ingestion RPC ก่อนตอบ LINE (สูงสุด 5 events, ใช้เวลาที่เหลือใน budget 1.5 วินาทีนับตั้งแต่เข้า handler) ให้ใบลา/web notification/Discord outbox commit ใน transaction เดิมก่อนส่ง Discord หลัง response ใช้ ingest service ร่วมกับ worker และไม่ reset event DONE เมื่อเกิด concurrent retry หลัง fast path commit แล้ว Background drain เพิ่มเป็น 20 batches ภายใต้ time budget เดิม กระดิ่งตรวจทุก 5 วินาที ทดสอบ fast-path ingestion, defer เมื่อ DB/ข้อมูลตั้งค่ามีปัญหาหรือ enqueue ใช้ budget หมด, จำกัด burst, ไม่ ACK ก่อน ingestion จบ, Discord success/429/network failure ด้วย mocked providers รวมอยู่ใน 93 tests ไม่ได้อ้างว่าส่ง Discord production ผ่านโค้ดเวอร์ชันนี้แล้ว และยังต้อง deploy/วัด latency จริงบน Vercel

ตรวจคิววันที่ 14 พฤศจิกายน 2569: พบ LINE event PENDING attempts=0 ข้อมูล parse ครบและตรงกับพนักงาน จึงยังไม่เริ่มประมวลผล ไม่ใช่ Discord ส่งล้มเหลว ขณะตรวจพบเฉพาะ GitHub run จาก push/manual จึงปรับ cron เป็นรูปแบบมาตรฐาน `*/5 * * * *` เพื่อลงทะเบียน schedule ใหม่ และเพิ่ม build/workerMode ใน health response ต้องแยกหลักฐาน run ชนิด schedule ออกจาก push/manual และตรวจ production deployment จริงก่อนยืนยันการปลุกจาก webhook

- ไม่รัน migration ใน Supabase project จริง และไม่เปลี่ยนข้อมูล/schema `public` ใด ๆ ของผู้ใช้
- ยังไม่มี credentials จึงไม่ได้ทดสอบ Supabase Auth/SMTP/PostgREST/Storage policies บน project จริง
- ไม่ส่งข้อความจริงผ่าน LINE/Discord และไม่สร้างบัญชี/กลุ่ม/channel ภายนอก
- ไม่ push source, ไม่สร้าง remote branches, ไม่รัน GitHub Actions และไม่ deploy Vercel
- หน้าภายใน authenticated dashboard/detail/management ผ่าน compile/type checks แต่ยังไม่ได้ browser QA ด้วยบัญชีจริง
- ไม่วัด Core Web Vitals หรือ API/database p95 บน infrastructure จริง ค่าใน ARCHITECTURE.md เป็น performance budgets เท่านั้น
- การตรวจ dependency ทั้งชุดยังมี moderate advisories ของ development tooling 8 รายการ; ผล 0 vulnerabilities ที่กล่าวข้างต้นจำกัด production dependencies
- PGlite ใช้ PostgreSQL engine จริงแต่ไม่แทน managed Supabase, Storage API หรือการทดสอบ distributed concurrency บน provider จริง

ต้องตั้งค่า [DEPLOYMENT.md](DEPLOYMENT.md) และผ่าน [ACCEPTANCE.md](ACCEPTANCE.md) ก่อนประกาศพร้อม production
