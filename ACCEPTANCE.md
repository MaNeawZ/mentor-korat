# Acceptance ก่อน production

เอกสารนี้เป็นรายการตรวจด้วยบริการ staging จริง ช่องที่ยังว่างไม่ได้หมายความว่าทดสอบผ่านแล้ว รายละเอียด automated tests ที่รันแล้วอยู่ใน VERIFICATION.md

## ผู้ใช้และสิทธิ์

- [ ] หัวหน้าศูนย์คนแรก login ด้วย Supabase Auth จริง; logout และ session หมดอายุทำงาน
- [ ] recovery email → callback → reset ด้วยรหัสผ่านใหม่ ทั้ง desktop/mobile
- [ ] เพิ่มหัวหน้าศูนย์คนที่สอง, HR, Mentor ผ่าน Auth UUID; ทดสอบ disabled user
- [ ] Mentor สองคนเห็นเฉพาะข้อมูลตัวเองทั้ง UI และ PostgREST
- [ ] HR override allow/deny มีผลทันที และไม่มี role escalation ผ่าน API
- [ ] เพิ่ม/แก้ไข/ปิดพนักงาน เพิ่มแผนก Assign หลายคน เปลี่ยน Mentor และตรวจ audit

## LINE → evidence → review

- [ ] Verify webhook และ group discovery จาก LINE จริง; เปิดเฉพาะกลุ่มที่อนุญาต
- [ ] event ซ้ำไม่สร้างใบลาซ้ำ; document ซ้ำสร้าง issue; signature ผิดถูกปฏิเสธ
- [ ] sample Thai message อ่านวันที่ BE/type/period ถูก; unknown employee/name mismatch/missing fields แจ้งให้ตรวจ
- [ ] พนักงานไม่มี Mentor สร้าง UNASSIGNED แยกจาก evidence status; หัวหน้าศูนย์ทั้งสองได้รับแจ้งเตือน
- [ ] Mentor login คัดลอก secure link ส่งให้ employee โดยตรง
- [ ] employee เปิดในมือถือโดยไม่ login เลือก Gallery/Camera, preview/change/remove/compress/upload
- [ ] private storage ไม่มี anonymous read และ evidence endpoint ตรวจ RLS จริงใน shared project
- [ ] used/revoked/invalid link แสดงข้อความถูก; upload พร้อมกันสำเร็จเพียงหนึ่งรายการ
- [ ] upload ล้มเหลวลองใหม่ได้; network ambiguity ไม่ลบหลักฐานที่ commit แล้ว
- [ ] Mentor ขอรูปใหม่พร้อมเหตุผล; link เก่าใช้ไม่ได้; upload version ใหม่ยังเก็บประวัติเดิม
- [ ] Mentor precheck → HR/head verify/reject; เหตุผล/ประเภท reject/ผู้ตรวจ/เวลาครบ
- [ ] เปิดสอง browser ตรวจรายการเดียวกัน อีกคำขอได้ 409 พร้อมโหลดสถานะใหม่
- [ ] แก้ข้อมูลที่ Bot อ่านผิดมี old/new/reason และ raw LINE message คงเดิม

## Notifications / integrations

- [ ] กระดิ่งและ list เฉพาะผู้มีสิทธิ์, unread/read/read-all และเปิด leave ที่เกี่ยวข้อง
- [ ] webhook บันทึกใบลา/แจ้งเตือนเว็บผ่าน fast path ก่อนตอบ HTTP และส่ง Discord ต่อหลัง response โดยไม่รอรอบ schedule; หน้าเปิดตรวจ notification ทุก 5 วินาทีและ fallback refresh ทุก 60 วินาที วัดเวลาจริงหลัง deploy ก่อนรับประกัน latency
- [ ] Discord private channel มีรายละเอียด/สถานะ/mention ผู้รับผิดชอบจริงและ protected link
- [ ] ห้อง Discord จำกัดสมาชิก แนบ active upload link ให้ Mentor ส่งต่อเฉพาะสถานะรอหลักฐาน/ขอใหม่ และใช้ได้ครั้งเดียว ไม่มีรูปหลักฐานในห้อง; LINE text ทำให้ mention everyone ไม่ได้
- [ ] โหมด edit เอาลิงก์ออกหลังอัปโหลด โหมด events แม้มีข้อความลิงก์เก่าค้างอยู่ token ที่ใช้แล้ว/ยกเลิกแล้วต้องใช้ไม่ได้
- [ ] edit mode PATCH message เดิม; events mode แสดง status ของแต่ละ event
- [ ] simulated Discord 429/outage มี retry/backoff; ใบลาบันทึกสำเร็จแม้ส่ง Discord ไม่ได้
- [ ] optional DM ส่งให้ Mentor mapping จริง; DM ไม่ได้มีเว็บแจ้ง fallback
- [ ] external scheduler ที่เลือกทำงานจริง (GitHub Actions ทุก 5 นาที หรือ provider ทุก 1 นาที); ตั้ง URL/secret และทดสอบ Run workflow; lease/FAILED/retry/audit ตรวจได้จาก UI

## Deployment / isolation / performance

- [ ] ทดสอบ migration บน development Supabase ก่อน production และยืนยัน public objects/data/policies เดิมไม่เปลี่ยน
- [ ] Exposed schemas เพิ่ม mentor_korat โดยคง public เดิม
- [ ] เช็ก storage policies เดิมไม่มี wildcard อนุญาตทุก bucket
- [ ] กำหนด log redaction สำหรับ upload URLs บน Vercel/CDN/APM และไม่มี third-party tracker
- [ ] PR dev/prd บังคับ CI validate/review; production secrets จำกัด environment
- [ ] Merge prd ทำ migration → production build → deploy → health check จริงและไม่มี Git auto-deploy ซ้ำ
- [ ] ทดสอบ rollback Vercel โดยไม่ลบ DB
- [ ] วัด LCP/INP/CLS และ query/API p95 บน staging ด้วยข้อมูลขนาดใช้งานจริง; บันทึกผลก่อนอ้าง performance
- [ ] ตรวจ light/dark/system/mobile ของ authenticated dashboard, employee tables, leave detail และ upload บนอุปกรณ์จริง
- [ ] กำหนด retention/backup/restore/incident response และผู้รับผิดชอบข้อมูลสุขภาพ

เมื่อรายการนี้ผ่านครบ ให้เจ้าของระบบบันทึกวันที่ version/commit และผู้ตรวจ ก่อนประกาศพร้อม production
