# Architecture

## ระบบหลัก

Server Components อ่านข้อมูลผ่าน session-bound Supabase client ที่เลือก `mentor_korat` โดยตรง RLS เป็นขอบเขตข้อมูลสำหรับผู้ใช้ทุกคน Route Handlers ตรวจ Auth ด้วย `auth.getUser()` และ profile ที่ active ก่อน mutation ทุกคำขอ UI ไม่ใช่ขอบเขตรักษาความปลอดภัย

UI → Route Handler (Origin, Auth, Zod) → domain/service → database RPC (permission, row lock, expected version) → tables/audit/notifications/outbox ใน transaction เดียวกัน

Repository ทำ query เฉพาะคอลัมน์ที่ใช้ รายการใบลาและพนักงานแบ่งหน้าทีละ 20 รายการ summary และจำนวนพนักงาน Mentor aggregate ในฐานข้อมูล ไม่ใช้ N+1 สำหรับ employee rows/department

## Authentication / authorization

Supabase SSR cookies → Proxy refresh → Server `getUser()` → `my_profile()` อ่าน role และคำนวณ effective permission (override มาก่อน default) บัญชี disabled จะไม่มี profile และไม่มีสิทธิ์อ่าน/เขียนข้อมูลใน RLS ไม่เปิด signup ในแอป ไม่สร้าง trigger ใน `auth` หรือ `public`

`has_permission()` และ `can_view()` เป็น SECURITY DEFINER functions ที่ตั้ง `search_path=''` และระบุ schema เต็ม ป้องกัน RLS recursion ทุก app table เปิด RLS authenticated มี SELECT ตาม policy และ EXECUTE เฉพาะ RPC ที่กำหนด ไม่มี direct INSERT/UPDATE/DELETE

## LINE webhook

Unsend/correction: รับ signed unsend จาก active groups ใน durable queue เดิม เก็บ group/message tombstone ขั้นต่ำ redact raw/event text และ parsed issue ของข้อความที่ยกเลิก ตั้ง line_retracted/revoke ACTIVE links/แจ้งเว็บ+Discord transaction เดียว Ingest และ unsend serialize ด้วย transaction advisory lock ร่วมกัน การแทนที่ใช้ leave/raw IDs เดิมเฉพาะ draft ก่อนหลักฐาน/ตรวจ พร้อม match original sender/group/employee/new timestamp และ CAS version increment ออก token ใหม่ Notify LINE_UNSENT/LINE_CORRECTED แยกจาก evidence status Worker PATCH การ์ดและ POST mention ใหม่แม้ evidence status ไม่เปลี่ยน Out-of-order correction ที่เป็น duplicate ถูก retry เมื่อ unsend มาถึง โดยใช้ guard ชุดเดิม ไม่แก้ทับรายการที่หัวหน้าแก้หรือผ่าน workflow ไปแล้ว

1. จำกัด body ที่อ่านใน memory และตรวจ SHA256 HMAC จาก raw body
2. เก็บเฉพาะ group ID จาก event ที่ signature ถูกต้องเป็นกลุ่มรอยืนยัน `active=false` ไม่เก็บข้อความจากกลุ่มที่ไม่อนุญาต
3. สำหรับกลุ่ม active บันทึก `integration_events` โดยใช้ `webhookEventId` เป็น PK และ ignore duplicate ลงทะเบียน Next.js after() และอ่าน/บันทึกใบลาจาก events ที่เพิ่งรับก่อนตอบ 200 (ไม่เกิน 5 events ต่อ request, ใช้ AbortSignal budget 1.5 วินาทีร่วมกัน) transaction เดียวกันสร้าง web notification และ Discord outbox ไม่มีการเรียก Discord ก่อนตอบ LINE
4. หลัง response worker ส่ง Discord และ drain งานที่เหลือ โดย claim jobs ด้วย row locks / SKIP LOCKED และ lease 5 นาที ใช้ external scheduler เป็น fallback สำหรับ retry การรับโดยตรงและ worker ใช้ ingest service/RPC เดียวกัน; error handler ไม่ย้อนสถานะ DONE กลับเป็น PENDING หากอีก request commit แล้ว
5. Parse ข้อความแบบ deterministic, Thai month / BE year, ประเภทการลาจาก settings
6. `ingest_leave` lock event, ตรวจ employee/name/duplicate document/fields, ข้อมูลผิดเก็บ parsing issue และแจ้งผู้ดูแล ไม่เดาข้อมูล
7. ข้อมูลถูกสร้าง leave + raw message + hashed token + history + audit + web notification + Discord outbox ใน transaction เดียวกัน
8. พนักงานไม่มี Mentor: assignment_status=UNASSIGNED แต่ evidence status ยัง WAITING_EVIDENCE แจ้งหัวหน้าศูนย์ ไม่มอบหมายอัตโนมัติ

ข้อความที่ไม่เกี่ยวกับการลาจะทำเครื่องหมาย DONE และลบข้อความออกจาก payload ด้วย placeholder ข้อมูลผิดให้ผู้ดูแลตรวจแล้วส่งข้อความที่แก้ไขผ่าน LINE ด้วย event ใหม่ หากเป็นเอกสารซ้ำให้แก้ใบลาเดิมผ่านหน้ารายละเอียด ห้ามแก้ raw message

## Upload token / evidence

สร้าง nonce แบบ random 256 bits → HMAC-SHA256 ด้วย secret ฝั่ง server → token 256 bits URL-safe เก็บเฉพาะ SHA256(token) และ nonce ไม่เก็บ raw token Mentor ที่มีสิทธิ์ขอลิงก์ผ่าน protected endpoint ซึ่ง reconstruct ด้วย secret ได้ การอ่าน DB อย่างเดียวไม่เพียงพอสำหรับสร้างลิงก์

หนึ่ง active token ต่อใบลาบังคับด้วย partial unique index เมื่อ reupload ใช้ lock ใบลา → revoke เดิม → insert ใหม่ใน transaction เมื่อรับไฟล์: ตรวจ token/Discord migration readiness → จำกัด bytes → MIME/magic bytes → decode ด้วย sharp จำกัด 24MP → rotate/resize → WebP ล้าง EXIF → ส่ง multipart attachment ไป Discord (`wait=true`) → `complete_discord_upload` lock token/leave → บันทึก metadata provider/webhook ID/message ID/attachment ID + consume token + state + audit + outbox atomic ไฟล์ใหม่ไม่ผ่าน Supabase Storage และไม่บันทึก signed CDN URL ลง DB

Concurrent uploads อาจแนบไฟล์ชั่วคราวทั้งสอง แต่มี transaction เดียว consume ได้ อีกคำขอถูกปฏิเสธและลบข้อความแนบไฟล์ส่วนเกิน หาก Discord ล้มเหลว token ไม่เปลี่ยน หาก DB ตอบ SQLSTATE ยืนยัน rollback ลบข้อความชั่วคราวและเข้าคิว cleanup หากลบไม่สำเร็จ หาก transport ขาดจนไม่ทราบผล commit จะไม่ลบ เพราะอาจเป็นหลักฐานที่ commit แล้ว ต้อง reconcile orphan ภายหลัง ไม่ส่งไฟล์กลับ Supabase เป็น fallback รูปเก่ายังใช้ provider=supabase และอ่านจาก private bucket ตามเดิม

`GET /api/evidence/[id]` ตรวจ Auth/RLS ก่อนใช้ service อ่านไฟล์ สำหรับ Discord เรียก Get Webhook Message เพื่อได้ signed attachment URL ใหม่ทุกครั้ง ตรวจ HTTPS/Discord CDN/attachment path และจำกัด bytes ก่อน proxy แบบ private/no-store ไม่ redirect ไป CDN และไม่ส่ง webhook token ให้ browser คิวล้างข้อมูลเก็บ provider/reference เพื่อเลือก DELETE เฉพาะข้อความหลักฐาน Discord หรือ remove exact path ของ Supabase รุ่นเก่า แยกจากข้อความการ์ดสถานะ

## Review state machine

```text
WAITING_EVIDENCE ── upload ──> WAITING_MENTOR_REVIEW
                                  │ precheck
                                  ▼
                           WAITING_FINAL_REVIEW ── verify ──> VERIFIED
                                  │ reject
                                  ▼
                               REJECTED

WAITING_MENTOR_REVIEW / WAITING_FINAL_REVIEW
  ── request reupload (reason required) ──> REUPLOAD_REQUIRED
  ── upload new version ─────────────────> WAITING_MENTOR_REVIEW
```

ทุก review ตรวจ expected_version และ lock row ป้องกัน lost update / สองคนตรวจพร้อมกัน Mentor ทำ final decision ไม่ได้แม้มี override การปฏิเสธระบุ EVIDENCE หรือ LEAVE_DATA พร้อมเหตุผล ไม่ตีความว่าเป็นการปฏิเสธวันลาจาก HR อย่างเป็นทางการ ข้อมูล VERIFIED/REJECTED แก้ไขผ่าน workflow ปกติไม่ได้

เมื่อเปลี่ยน assignment เปลี่ยน employee และใบลาที่ยังไม่เสร็จใน transaction เก็บประวัติและแจ้ง Mentor ใหม่ ใบลาที่ปิดแล้วคงผู้ดูแลเดิม

## Notifications / Discord

Web notifications มี RLS ตาม recipient; โหลด 12 รายการล่าสุดและ unread count หน้าทั้งหมดมี pagination polling ทุก 5 วินาทีเมื่อ visible ไม่ส่ง request ซ้อนกัน และ refresh Server Components เมื่อ notification snapshot เปลี่ยน มี fallback refresh ทุก 60 วินาทีสำหรับรายการที่ไม่ได้สร้าง notification ให้ role นั้น ยังไม่เปิด Realtime publication เพื่อไม่เปลี่ยน shared publication ของระบบอื่น

การอัปโหลดหลักฐาน ตรวจใบลา และเปลี่ยน assignment จะปลุก worker หลัง commit เช่นเดียวกัน Background wake ทำได้สูงสุด 20 batches โดยหยุดเริ่ม batch ใหม่หลัง 120 วินาที และอยู่ภายใต้ maxDuration ของ function หาก wake ล้มเหลว/หมดเวลายังมี durable queue และ lease สำหรับ scheduler รอบถัดไป ไม่รับประกัน latency จากการรันในเครื่องแทน Vercel จริง

Discord outbox แยก transaction จากการส่งจริง webhook failure ไม่กระทบใบลา claim queue มี lease และ serialize delivery batches ป้องกัน cron ซ้อนกัน retry exponential backoff และเคารพ 429 retry_after สูงสุด 8 ครั้ง จากนั้น FAILED ให้ผู้ดูแล retry ผ่าน endpoint/UI ได้ ข้อความมี protected dashboard URL ไม่มี raw upload token หรือรูปหลักฐาน

เก็บ Discord message ID เพื่อ PATCH สถานะล่าสุด ตั้ง mode เป็น events ได้สำหรับข้อความใหม่ ปิด allowed_mentions parse ทั้งหมดและอนุญาตเฉพาะ Mentor ID ที่ map ใน DB ข้อความจาก LINE ทำให้ mention คนอื่นไม่ได้ Bot DM เป็น optional; ล้มเหลวแจ้ง Mentor ในเว็บให้คัดลอกลิงก์เอง

Discord embed แนบ active upload link ตามคำขอผู้ใช้สำหรับ Mentor ส่งต่อพนักงานในสถานะปัจจุบัน WAITING_EVIDENCE/REUPLOAD_REQUIRED โดย reconstruct ด้วย nonce/secret เดียวกับ protected link endpoint ไม่หมุน token ในขั้นตอน delivery ใช้ได้โดยไม่มี bot token และ optional DM ใช้ URL เดียวกัน หาก events แสดงสถานะเก่าแต่ปัจจุบันพ้นรออัปโหลดแล้วจะไม่แนบ token

การ์ด Discord แสดงสถานะปัจจุบันในหัวข้อและ field ทุกโหมด เพิ่มสถานะของเหตุการณ์เมื่อไม่ตรงกับปัจจุบัน โหมด edit เมื่อ PATCH สำเร็จและ job เป็นการเปลี่ยนสถานะจะ POST ข้อความแจ้งใหม่พร้อม allowed_mentions เฉพาะ Mentor และเก็บ mapping ของการ์ดเดิมไว้ โหมด events หรือ fallback สร้างการ์ดใหม่เมื่อการ์ดถูกลบ ใช้ mention บนการ์ดใหม่นั้นโดยไม่ส่งซ้ำอีกข้อความ Queue DONE หลังส่งการ์ดและข้อความแจ้งใหม่สำเร็จทั้งคู่ ไม่มี migration ใหม่เพราะ transaction อัปโหลด/ตรวจหลักฐานบันทึก outbox อยู่แล้ว

External webhook ไม่มี distributed transaction กับ DB จึงรับประกัน exactly-once ไม่ได้เมื่อ Discord รับข้อความแล้ว network ขาดก่อนบันทึก ID อาจเห็นข้อความซ้ำได้ กรณีปกติ retry ใช้ message ID ที่บันทึกแล้วและไม่มี worker ส่งซ้อนกัน ห้ามอ้าง exactly-once ภายนอก

## Performance budget

เป้าหมายก่อน release: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 บนมือถือที่เป็นตัวแทนผู้ใช้; authenticated list API/server render p95 < 800ms ใน region ใกล้ DB; query p95 < 100ms ภายใต้ข้อมูลที่คาดการณ์ นี่คือเป้าหมาย ไม่ใช่ผลที่ยืนยันแล้ว

ใช้ server-side pagination/indexed mentor/status/date, per-render React cache สำหรับ identity, batch reference queries, CSS loading skeleton, local Thai fonts, client compression, lazy evidence images และ reduced-motion support ต้องวัดด้วย Lighthouse/Web Vitals และ Supabase query statistics ใน staging หลังมี credentials ไม่มีการอ้าง Core Web Vitals จาก unit tests

## CI/CD

PR/push dev → lint/type/tests/migration checks/build → PR prd → production environment → validate → additive migration with advisory lock/checksum history → Vercel build/deploy → health check failure หยุดขั้นตอนทันที ไม่ rollback DB แบบ destructive

## Assumptions

- หนึ่งศูนย์; departments, mentors, employees ไม่ seed จำนวนตายตัว
- วันที่ลาเป็นวันเดียว ถ้าลาหลายวันให้แยกใบลา ไม่เดาช่วงวันที่
- ต้องตรงรหัสและชื่อพนักงาน (ละ whitespace ได้) ถ้าไม่ตรงแจ้งให้ตรวจสอบ
- หัวหน้าศูนย์ดูแลบัญชีผ่าน Supabase Auth + app UI; ไม่ส่งคำเชิญ/อีเมลสร้างบัญชีอัตโนมัติ
- retention_days เป็น policy ที่บันทึกได้ ยังไม่ทำ automatic deletion เพื่อป้องกันหลักฐานหายโดยไม่ได้ทบทวน
- ต้องมี external scheduler: เตรียม GitHub Actions ทุก 5 นาที เปิดอัตโนมัติหลังตั้ง secrets (ตั้ง variable=false เพื่อหยุดชั่วคราว; เวลาเริ่มอาจล่าช้า) หรือใช้ provider ภายนอกทุก 1 นาที ไม่มี Vercel cron ใน config
