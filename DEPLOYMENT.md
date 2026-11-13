# Setup และ deployment

## 1. Supabase โดยไม่กระทบ public

สำรองข้อมูลและทดลอง migration กับ **development Supabase project แยก** ก่อน production ห้าม `supabase db reset`, ห้าม test seed ใน project จริง

1. เปิด Project Settings → Data API → Exposed schemas **เพิ่ม** `mentor_korat` โดยคง `public` และ schema อื่นเดิมทั้งหมด ห้าม replace รายการเดิม
2. ใช้ SQL role ที่สร้าง schema ใหม่ได้ เก็บ connection string แบบ direct หรือ session pooler ใน `SUPABASE_MIGRATION_DATABASE_URL` ใช้ TLS ใน production
3. รัน `node --env-file=.env.local scripts/migrate.mjs --check` ตรวจ reviewed checksum และข้อห้าม schema
4. รัน `node --env-file=.env.local scripts/migrate.mjs` จะ lock migration, สร้างเฉพาะ mentor_korat, บันทึก version/checksum/applied_at, ข้ามไฟล์เดิม ถ้า checksum เปลี่ยนจะหยุด
5. รัน `npm run setup:storage` สร้าง private bucket `mentor-korat-evidence` ผ่าน Storage API **ไม่แก้ storage tables** ไม่เปิด public policies และไม่สร้าง anon object grants
6. ตั้งค่า Supabase Auth: ปิด public signup สำหรับ deployment นี้หากไม่กระทบระบบที่ใช้ project ร่วมกัน; หากระบบเดิมต้องใช้ signup ให้คงเดิม แอปนี้ตรวจ app_users เสมอ ผู้สมัครทั่วไปเข้าแอปไม่ได้
7. ตั้ง Site URL และเพิ่ม redirect URL `https://your-domain/auth/callback` โดยคง redirect ของระบบอื่นไว้ เปิด email provider และ SMTP สำหรับ recovery ทดสอบส่ง recovery จริง
8. ใช้ recovery email template ที่มี `{{ .ConfirmationURL }}` เพื่อ PKCE exchange ผู้ใช้เปิดลิงก์บน browser ที่ขอ recovery ถ้าเปลี่ยนอุปกรณ์ให้ขอลิงก์ใหม่
9. สร้าง Auth user ของหัวหน้าศูนย์แรกใน Supabase Dashboard, ตั้ง BOOTSTRAP_USER_ID/NAME แล้ว `npm run bootstrap` ใช้ได้เมื่อ app_users ยังว่างเท่านั้น นำค่าทั้งสองออกหลังใช้
10. Login → เพิ่มแผนก → เพิ่ม employee → สร้าง Auth user ของ Mentor/HR/หัวหน้าศูนย์คนที่สอง → หน้า settings/users ผูก UUID → ตั้ง Discord ID → assign employees

ไม่เพิ่ม Auth trigger, ไม่แก้ `public`, ไม่เปลี่ยน shared storage/realtime configuration โดยอัตโนมัติ หากนโยบาย storage ของระบบเดิมอนุญาตอ่านทุก bucket ต้องแก้ขอบเขตนโยบายโดยเจ้าของ project ก่อนใช้ข้อมูลจริง เนื่องจากระบบนี้ไม่แก้ policies ของระบบอื่น

### ทางเลือกเมื่อไม่ทราบรหัสผ่านฐานข้อมูล: SQL Editor

สำหรับการติดตั้งด้วยมือ สามารถใช้ Supabase Dashboard SQL Editor โดยไม่ reset รหัสผ่านและไม่ใช้ SUPABASE_MIGRATION_DATABASE_URL:

1. รัน `npm.cmd run migrations:export` จะสร้าง `supabase/setup-sql-editor.sql` จาก migrations ที่ผ่าน checksum check โดยไม่เชื่อมต่อฐานข้อมูล
2. เปิดไฟล์แล้วคัดลอก **เนื้อหาทั้งหมด** ไปวางใน SQL Editor → New query ของ project ที่ต้องการ แล้ว Run ทั้งไฟล์ อย่าเลือกเฉพาะบางบรรทัด
3. SQL ใช้ transaction, advisory lock และ schema_migrations เหมือน CLI รันซ้ำหลังสำเร็จได้ และจะหยุดเมื่อ checksum ของ version เดิมไม่ตรง ไม่มีการแก้ schema public
4. เพิ่ม mentor_korat ใน API Exposed schemas โดยคง public และค่าเดิมทั้งหมด
5. รัน `npm.cmd run bootstrap` เพื่อเพิ่มหัวหน้าศูนย์จาก Auth user ที่เตรียมไว้ แล้ว login

วิธีนี้ใช้สิทธิ์บัญชี Dashboard ที่คุณมี ไม่ต้องทราบรหัสผ่านฐานข้อมูล ส่วน CI/CD migration อัตโนมัติในอนาคตยังต้องมี connection credentials ที่ใช้ได้ หรือวางขั้นตอน migration ด้วยมือก่อน deploy

## 2. LINE

1. สร้าง Messaging API channel ของ LINE Official Account นำ channel secret/access token ใส่ server environment
2. เปิดอนุญาต bot เข้ากลุ่ม และตั้ง webhook URL `https://your-domain/api/webhooks/line` กด Verify (รองรับ events ว่าง)
3. เปิด Use webhook และ webhook redelivery ถ้ามี ปิด auto-response ที่รบกวนตามการตั้งค่าบัญชีของคุณ
4. เชิญ bot เข้ากลุ่ม ส่งข้อความหนึ่งครั้ง event ที่มี signature ถูกต้องทำให้ group ID แสดงใน `/settings/line` เป็น **รอยืนยัน / ปิดใช้งาน** ไม่เก็บข้อความจากกลุ่มนี้
5. ผู้ดูแลตรวจสอบ Group ID `C...` ของกลุ่มที่เชิญแล้วแก้ชื่อ/เปิดใช้งาน ถ้าทราบ ID อยู่แล้วเพิ่มผ่าน UI ได้
6. หลังเปิดแล้ว ส่งข้อความแจ้งลาทดสอบ **ด้วย employee ใน staging เท่านั้น** ตรวจ queue, parsing issues, leave และ Discord
7. Bot ไม่ reply ข้อความอัตโนมัติ Mentor ส่ง upload link ให้ employee เอง Group membership/admin setup ต้องทำใน LINE app/console

อ่านมาตรฐาน signature และ redelivery: [LINE signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)

## 3. Discord

สร้าง private channel จำกัดสมาชิกที่ได้รับอนุญาตให้อ่านเหตุผลการลา สร้าง webhook ใน channel นั้น ใส่ `DISCORD_WEBHOOK_URL` ฝั่ง server แล้วใช้ปุ่มทดสอบใน `/settings/discord` การกดปุ่มนี้ส่งข้อความจริงตามที่ผู้ดูแลสั่ง ไม่มีการส่งรูปหลักฐานอัตโนมัติ

เปิด Discord Developer Mode → Copy User ID ของ Mentor → ใส่ settings/users ตรวจว่า ID เป็นของคนที่รับผิดชอบจริง `allowed_mentions` จำกัดเฉพาะ ID นี้ อ่าน [Discord Webhook API](https://github.com/discord/discord-api-docs/blob/main/developers/resources/webhook.mdx)

Optional DM: สร้าง bot และนำเข้า server โดยเจ้าของ server เก็บ DISCORD_BOT_TOKEN/GUILD_ID ใน environment ผู้รับต้องอนุญาต DM ถ้าส่งไม่ได้ ระบบแจ้งเว็บให้คัดลอกลิงก์ ไม่ทำให้ workflow หยุด

ค่า `discord_mode` ใน settings: `"edit"` อัปเดตข้อความเดิม, `"events"` ส่งข้อความใหม่ (ค่าเป็น JSON string)

## 4. Vercel

1. สร้าง project framework Next.js, Node 24, region ใกล้ Supabase ใส่ runtime env ตาม .env.example
2. ตั้ง NEXT_PUBLIC_APP_URL เป็น production origin จริงก่อน build ตั้ง UPLOAD_TOKEN_SECRET/CRON_SECRET แบบถาวรและมีความยาวอย่างน้อย 32 ตัวอักษร
3. ไม่มี Vercel cron ใน vercel.json แล้ว ใช้ external scheduler ตามหัวข้อด้านล่าง เรียก GET `/api/cron/process` ด้วย `Authorization: Bearer <CRON_SECRET>` ห้ามส่ง secret ใน query string
4. Function maxDuration=300 วินาทีต้องอยู่ใน plan ที่รองรับ batch ส่ง Discord สูงสุด 5 งาน/รอบ
5. Vercel มี request body limit: frontend บีบอัดภาพก่อนส่ง หากไฟล์หลังบีบอัดยังใหญ่เกิน provider limit ให้เลือกภาพขนาดเล็กลง หรือโฮสต์ Next.js บน runtime ที่รองรับ 8 MB ระบบ server จำกัดไฟล์ต้นฉบับ 8 MB และรูป 24MP
6. ปิด Git auto-deploy เพื่อให้ GitHub Actions เป็นผู้ควบคุม migration ก่อน deploy มี `git.deploymentEnabled=false` ใน config ตรวจ setting ใน project ด้วย
7. Preview ต้องใช้ development Supabase/environment ที่แยกกันและ NEXT_PUBLIC_APP_URL ของ preview ห้าม preview ชี้ production หรือใช้ production migration connection
8. ถ้าเปิด Deployment Protection ให้ใส่ VERCEL_AUTOMATION_BYPASS_SECRET ใน GitHub เพื่อ health check

## 5. GitHub Actions

Repository ปัจจุบันเริ่มที่ main ให้สร้าง `dev` และ `prd` จาก source ที่ตรวจแล้วเมื่อพร้อม push ไม่เปลี่ยน remote branch ให้อัตโนมัติ

ตั้ง production environment secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, SUPABASE_MIGRATION_DATABASE_URL และ optional VERCEL_AUTOMATION_BYPASS_SECRET ตัวแปร Supabase/LINE/Discord runtime ตั้งใน Vercel production environment ให้ครบ

ตั้ง Branch Protection dev/prd: require PR, review, CI `validate`, block force push/deletion กำหนด CODEOWNERS ให้ migration/security/workflows ต้อง review ตรวจ SQL และ checksum manifest คู่กัน ไม่แก้ applied migration ให้เพิ่มไฟล์ version ใหม่และปรับ manifest หลัง review

`ci.yml` ไม่ใช้ production secrets: lint → typecheck → unit + PostgreSQL/RLS integration → migration check → build → production dependency audit

CI ยังติดตั้ง Chromium เพื่อรัน browser tests กับ production build และแนบ test-results เป็น artifact สำหรับ review หากต้องการ preview ให้ใช้ Vercel project/environment ที่แยกจาก production: `npx vercel pull --environment=preview` → `npx vercel build` → `npx vercel deploy --prebuilt` ต้องตั้งค่าฐานข้อมูล development และ preview origin ก่อน build ไม่มีขั้นตอน migrate production จาก preview

`deploy-prd.yml` push prd: checks → additive migration → pull env → production build → deploy → health check → job summary ใช้ concurrency group ป้องกัน deploy ซ้อน ถ้า migration fail จะไม่ build/deploy ไม่เปิดเผย credentials ใน output

### External scheduler (ไม่ใช้ Vercel Cron)

ข้อความ LINE จะบันทึกคิวก่อน แล้วพยายามสร้างใบลา/แจ้งเตือนเว็บจากข้อความที่เพิ่งรับภายในเวลาที่เหลือจาก budget 1.5 วินาทีนับตั้งแต่เข้า handler (สูงสุด 5 events) ก่อนตอบ HTTP จากนั้นส่ง Discord และทำงานที่เหลือต่อผ่าน Next.js after() การอัปโหลดหลักฐาน การตรวจใบลา และเปลี่ยน assignment ก็ปลุก worker หลัง commit เช่นกัน ต้องใช้ deployment ที่รองรับ after()/waitUntil และ maxDuration ที่ตั้งไว้ หาก DB ช้าหรือ Discord ขัดข้อง งานยังอยู่ในคิวสำหรับ retry [LINE ระบุ timeout เมื่อไม่ตอบภายใน 2 วินาที](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/) จึงต้องวัดเวลาจริงรวม cold start/การอ่าน body/การเก็บ event; budget เป็นการจำกัด fast path ไม่ใช่การรับประกัน end-to-end latency

เตรียม `.github/workflows/process-worker.yml` เรียก worker ทุก 5 นาทีผ่าน GitHub Actions เป็น fallback สำหรับ retry/งานค้าง มี concurrency control และกด Run workflow เองได้ ไม่ใช้ database password และไม่รัน migration อัตโนมัติ

หลัง deploy แอปสำเร็จ:

1. ใน GitHub repository → Settings → Secrets and variables → Actions → Secrets เพิ่ม repository secrets:
   - `WORKER_BASE_URL`: production origin จริง เช่น `https://your-app.vercel.app` ไม่ต้องใส่ `/api/cron/process`
   - `CRON_SECRET`: ค่าเดียวกับ Vercel อย่างน้อย 32 ตัวอักษร
   - `VERCEL_AUTOMATION_BYPASS_SECRET`: optional ถ้าเปิด Vercel Deployment Protection ใช้ secret ที่สร้างไว้สำหรับ automation
2. ไป Actions → **Process Worker** → **Run workflow** แล้วตรวจ log ว่า `Worker completed. Processed jobs: ...` ตัวเลข 0 หมายถึงเรียกสำเร็จแต่ไม่มีงานพร้อมประมวลผล
3. รอบอัตโนมัติเปิดเป็นค่าเริ่มต้น ไม่ต้องเพิ่ม variable เพื่อเริ่มใช้งาน หลัง push เปลี่ยน workflow/caller script บน main จะเรียกหนึ่งรอบอัตโนมัติด้วย หากต้องการหยุดชั่วคราว ให้เพิ่ม repository variable `WORKER_SCHEDULER_ENABLED=false` หากเคยตั้ง false ไว้ ให้ลบ variable หรือเปลี่ยนเป็น true เพื่อเปิดกลับ

Workflow ต้องอยู่ใน default branch (ตอนนี้ main) จึงจะทำงานตามเวลา ไม่ต้องกด Re-run เพื่อเริ่มแต่ละรอบ ไม่มีการส่ง secret ใน URL หรือพิมพ์ headers/body ลง log และไม่ตาม HTTP redirect เพื่อไม่ส่ง bearer token ไปปลายทางอื่น หากไม่ตั้ง secrets, ได้ HTTP error, ได้หน้า login HTML หรือรูปแบบ JSON ไม่ถูกต้อง จะ fail ชัดเจน งานที่ fail จะมีรอบ schedule ถัดไปลองเรียกใหม่

GitHub scheduled Actions ถี่สุด 5 นาที อาจเริ่มล่าช้า/ถูกข้ามเมื่อระบบหนาแน่น ไม่รับประกันว่า LINE/Discord จะอัปเดตภายใน 5 นาที และ public repository ที่ไม่มีกิจกรรม 60 วันอาจถูกปิด schedule อัตโนมัติ ตรวจ GitHub Actions usage/quota และสถานะ schedule เป็นระยะ อ่าน [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

หากต้องการ retry/กู้คืนงานค้างทุก **1 นาที** ให้ใช้ scheduler ภายนอกที่รองรับ custom headers โดยตั้ง:

```text
Method: GET
URL: https://your-app.vercel.app/api/cron/process
Header: Authorization: Bearer <ค่า CRON_SECRET เดียวกับ Vercel>
Interval: every 1 minute
```

หากมี Deployment Protection เพิ่ม header `x-vercel-protection-bypass` ตาม [Vercel automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) ตั้ง `WORKER_SCHEDULER_ENABLED=false` เมื่อใช้ provider อื่นเพื่อไม่เรียกซ้ำ อย่าเพียงลบ cron แล้วปล่อย worker ไม่มีผู้เรียก เพราะ LINE events และ Discord จะค้างในคิว

ทั้งสองแบบใช้ endpoint เดิมและยังตรวจ bearer secret เหมือนเดิม ไม่เปลี่ยน Supabase schema หรือข้อมูลเดิม การถอด cron แก้ข้อจำกัดการ deploy cron บน Hobby แต่ยังต้องตรวจเงื่อนไขแผนสำหรับการใช้งานองค์กรและ quota ของ provider เอง

## 6. Migration safety และ rollback

Migration runner ใช้ advisory transaction lock, version/checksum history, atomic transaction รวมทุก pending file และไม่ใช้ reset SQL ที่อยู่ใน manifest ผ่านการตรวจ scope แล้ว; regex เป็น guard เสริม **ไม่ใช่ SQL sandbox** ห้ามนำ SQL ที่ไม่เชื่อถือมาเพิ่ม manifest โดยไม่ review

ถ้า build/deploy หลัง migration ล้มเหลว schema ที่เพิ่มจะยังอยู่ ใช้ forward-compatible migrations ให้ version เก่าทำงานต่อได้ เลือก deployment ก่อนหน้าใน Vercel แล้ว Promote/Rollback ตรวจ `/api/health` และ smoke workflow ไม่ทำ down migration อัตโนมัติ ถ้าต้องแก้ DB ให้ออก forward migration หลัง review และ backup

## 7. Operations

ปุ่ม **ล้างประวัติเก่าทั้งหมด** ต้องติดตั้ง `202611140003_clear_audit_history.sql` เพิ่มหนึ่งครั้ง (หรือใช้ SQL Editor bundle ล่าสุด) และ deploy main ล่าสุด หัวหน้าศูนย์ที่มีสิทธิ์ `data.clear` ใช้ได้จากหน้าประวัติการดำเนินการหรือหน้าตั้งค่า แยกจากปุ่มล้างใบลาเพื่อให้ล้าง audit หลังเคลียร์ใบลาไปแล้วได้ มี preview/fingerprint/lock/คำยืนยันเฉพาะ/เหตุผล หากประวัติเปลี่ยนระหว่างยืนยันจะต้องตรวจจำนวนใหม่ ลบเฉพาะ audit เก่าทั้งหมดและเขียนบันทึกผู้ล้าง/เวลา/เหตุผล/จำนวนที่ลบกลับ 1 รายการใน transaction เดียว การติดตั้ง migration ไม่เรียกการลบจริง

หากกดล้างข้อมูลแล้วได้ 503 หลังติดตั้ง migration แรก ให้ติดตั้ง `202611140002_clear_data_safeupdate.sql` เพิ่ม (หรือรัน `supabase/setup-sql-editor.sql` ฉบับล่าสุดทั้งไฟล์) เพื่อรองรับ API session ที่เปิด safeupdate การอัปเดตนี้ไม่ลบข้อมูลระหว่างติดตั้งและไม่ปิด safeupdate จากนั้น deploy main ล่าสุด หากยังไม่สำเร็จ ข้อความใหม่จะแสดงรหัส `CLEAR_DB_*` สำหรับวินิจฉัย โดย log เก็บเฉพาะ SQLSTATE ไม่เก็บ payload หรือข้อมูลส่วนตัว

ฟีเจอร์ล้างข้อมูลต้องติดตั้ง migration `202611140001_clear_leave_data.sql` หนึ่งครั้งก่อนใช้งาน หากใช้ SQL Editor ให้เปิด `supabase/setup-sql-editor.sql` ฉบับล่าสุด คัดลอกทั้งหมดไปรันใน Supabase SQL Editor ของโปรเจกต์เดิม ตัว bundle ตรวจ checksum/ข้าม migration ที่ติดตั้งแล้ว และไม่เรียกฟังก์ชันล้างข้อมูลระหว่างติดตั้ง จากนั้น deploy main ล่าสุดและเข้าสู่ระบบใหม่เพื่อรับสิทธิ์ `data.clear` ของหัวหน้าศูนย์

ปุ่มอยู่ที่ **ตั้งค่าระบบ → ล้างข้อมูลใบลา** ตรวจจำนวนก่อนพิมพ์ `ล้างข้อมูลใบลา` และระบุเหตุผล จะลบใบลาทั้งหมด ไม่ใช่เฉพาะรายการที่มีคำว่าทดสอบ ข้อมูลหลักและ audit ยังอยู่ ไม่ลบข้อความในห้อง Discord ไฟล์ Storage ใช้ durable cleanup queue และ worker เดิม ระบบแสดงจำนวนค้าง/ล้มเหลว ลองใหม่ได้จากหน้าเดียวกัน ลิงก์อัปโหลดเดิมจะใช้ไม่ได้ หลีกเลี่ยงให้ผู้ใช้ส่งใบลา/อัปโหลดระหว่างเคลียร์ข้อมูล รายการใหม่ที่มาหลัง transaction ยังคงรับตามปกติ

ตรวจ `/api/health`, queue depth/FAILED และจำนวน parsing issues เป็นประจำ ตรวจ external scheduler ทำงานตามรอบที่เลือก งาน PROCESSING หมด lease หลัง 5 นาทีจึงพร้อมให้ worker รอบถัดไป claim ใหม่ FAILED ลองใหม่ได้ด้วย `POST /api/queues/retry` หรือปุ่มในหน้าการเชื่อมต่อ พร้อมยืนยันและ audit

Health response ของเวอร์ชันล่าสุดมี `build` (commit สั้น ถ้า Vercel ให้ค่า metadata) และ `workerMode: "inline-line-after-discord"` สำหรับยืนยันว่าเว็บใช้เส้นทางสร้างใบลา/แจ้งเตือนเว็บใน webhook แล้วส่ง Discord ต่อหลัง response หากตอบเพียง `status` หรือเป็นโหมดเก่า อย่าเพิ่งสรุปว่าเวอร์ชันใหม่นี้ถูก deploy แล้ว และอย่าใช้ผล run จาก event `push`/`workflow_dispatch` แทนหลักฐานว่า event `schedule` ทำงาน ตรวจชนิด event ของ run จริงใน GitHub ด้วย

ปิด request URL/body logging และ analytics สำหรับ `/upload/*` และ `/api/upload/*` ที่ reverse proxy/APM/CDN เนื่องจาก URL มี bearer token ห้าม paste token ใน ticket/log หรือแชร์ช่องกลาง หน้า upload ไม่ใส่ tracker และตั้ง no-referrer

ทบทวน retention_days กับฝ่ายบุคคล กำหนด backup และผู้เข้าถึง เหตุผลทางสุขภาพและหลักฐานไม่ควรเก็บเกินนโยบาย ไม่มี scheduled deletion ที่อาจลบหลักฐานโดยไม่ทบทวน การ reconcile orphan storage ต้องเทียบ metadata และอายุ >24h ก่อนเจ้าของระบบอนุมัติลบผ่าน Storage API

ก่อน production ทำ acceptance ใน [ACCEPTANCE.md](ACCEPTANCE.md) ให้ครบ โดยเฉพาะ Supabase API grants, storage policy ของ project ร่วม, recovery email, LINE redelivery และ actual Discord retry
