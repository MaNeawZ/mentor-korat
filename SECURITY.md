# Security model

## Authorization

ทุก protected layout ตรวจ Supabase Auth ผ่าน server ทุก API ตรวจ identity ไม่เชื่อ client role `my_profile` คำนวณ permission จาก DB และตรวจ active ทุกครั้ง RLS บังคับข้อมูลสำหรับ browser/session clients; direct anonymous SELECT ถูกปฏิเสธ

Mentor เห็นเฉพาะ assigned leaves/employees โดยค่าเริ่มต้น ถ้าให้ view_all override ต้อง review ความจำเป็น Mentor ทำ final review/reject ไม่ได้แม้มี permission override HR ขึ้นกับ permission override บัญชี disabled ถูกปิดที่ DB ทันที ข้อมูล profile ตัวเองอาจยังอ่านชื่อได้ แต่ไม่มีข้อมูลใบลา/หลักฐาน

SECURITY DEFINER functions ใช้ empty search_path และ qualified references ไม่เปิด execute ให้ PUBLIC/anon ยกเว้น auth.uid มาตรฐานของ Supabase Private helper เช่น consume token, ingest, claim, notify, rotate token เป็น service-role only ไม่มี unrestricted client mutation

## Secrets

service client อยู่ใน `server-only` module ไม่ export key ไป browser `NEXT_PUBLIC_*` มีเฉพาะ URL/publishable key/app origin token secret และ service role เป็น server env ห้ามใส่ secret ใน source/log/CI artifacts webhook errors บันทึกเฉพาะ error code ไม่บันทึก payload/token/health reason

Upload token ไม่เก็บ plaintext: random nonce + HMAC server secret → SHA256 hash ตรวจ lookup เก็บ nonce สำหรับ reconstruct เฉพาะ endpoint ที่ตรวจใบลาผ่าน RLS หนึ่ง active token/leave, revoke ทันทีเมื่อ reupload, consume ใน transaction หลัง storage upload สำเร็จ

หาก UPLOAD_TOKEN_SECRET รั่ว ให้เปลี่ยน secret และ revoke/reissue active links ทั้งหมดใน maintenance window การเปลี่ยน secret โดยไม่ reissue ทำให้ hash เก่าไม่ตรงกับลิงก์ที่ reconstruct ใหม่ ห้ามหมุน secret แบบไม่มีแผน

## Evidence privacy

Private bucket เท่านั้น ไม่ใช้ public URL ห้ามแก้ storage tables โดยตรง Secure evidence endpoint ตรวจ metadata ด้วย session RLS แล้วจึงใช้ service role download ส่ง Cache-Control private/no-store ไม่ให้ Next Image optimizer cache รูปสุขภาพ หน้าจอใช้ img แบบ lazy ที่ intentional เพื่อตรวจ permission ทุกครั้ง

Upload จำกัดขนาด/bytes แม้ไม่มี Content-Length ตรวจ MIME และ magic bytes แล้ว decode จริงผ่าน sharp จำกัด input pixels resize/normalize/WebP ล้าง metadata ไม่ยอมรับ SVG/PDF/GIF ไม่ใช้ filename ที่ผู้ใช้ส่งมา สุ่ม object path ป้องกัน overwrite และยกเลิก token เฉพาะหลัง commit metadata

Token URL เป็น bearer credential ต้องตั้ง request-log redaction ใน infrastructure ทั้งหมด no-referrer และ no third-party analytics ช่วยลดการรั่ว แต่ไม่แทนการป้องกันฝั่ง CDN/APM ตามขอบเขตที่ผู้ใช้ขอ ข้อความ Discord แนบ active upload link ให้ Mentor ส่งต่อพนักงานเมื่อสถานะปัจจุบันรอหลักฐาน/ขอใหม่ คนที่อ่านห้องนั้นจะใช้ลิงก์อัปโหลดได้โดยไม่ต้อง login จึงใช้ห้อง private ที่จำกัดสมาชิก การ retry ใช้ token เดิม ไม่ rotate; token ใช้ได้ครั้งเดียว และถูก revoke เมื่อขอหลักฐานใหม่ โหมด edit เอาลิงก์ออกเมื่อสถานะพ้นรออัปโหลด ส่วนข้อความ events เก่าที่มีลิงก์ยังคงอยู่แต่ server ปฏิเสธ token ที่ใช้แล้ว/ยกเลิกแล้ว Optional DM ใช้ลิงก์ active เดียวกัน

## Request security

Cookie mutations ตรวจ Origin ตรง NEXT_PUBLIC_APP_URL รวม JSON และ upload ไม่ยอมรับ missing Origin ใช้ HTTPS production, CSP/frame deny/nosniff/permissions policy/HSTS, React escape text และไม่มี dangerouslySetInnerHTML

Login/recovery และ public upload ใช้ shared PostgreSQL rate limiter ลด brute force ต้องให้ reverse proxy sanitize x-forwarded-for และเพิ่ม edge/WAF rate limit สำหรับ traffic ปริมาณมาก แอป limiter ไม่ใช่ DDoS protection

LINE ตรวจ HMAC SHA256 raw body ก่อน JSON parse/DB access จำกัด body, allowlist group, duplicate event/document constraints รายชื่อกลุ่มรอยืนยันมาจาก signed event แต่ผู้ดูแลต้องยืนยันว่าเป็นกลุ่มที่ต้องการก่อนเปิด

Discord จำกัด allowed_mentions.users ตาม Mentor ID และ parse=[] ไม่แนบหลักฐาน แสดงเหตุผลการลาเฉพาะ private channel ที่ผู้ดูแลกำหนด หาก channel เปลี่ยนเป็นสาธารณะเป็นความเสี่ยงด้าน operation ต้องตรวจสิทธิ์เป็นระยะ

## Transactions / audit

Review มี row lock + version CAS จึงไม่ทับผลตรวจของอีกคน DB ฟังก์ชันเปลี่ยนสถานะพร้อม audit, history, notifications และ outbox ใน transaction การแก้ไขไม่แก้ raw LINE message authenticated ไม่มี UPDATE raw messages หรือ DELETE audit

Assignment ทำโดยผู้มีสิทธิ์ แก้ไขผู้ใช้ตัวเองผ่าน admin UI ไม่ได้ ลดการปิดบัญชีหัวหน้าศูนย์สุดท้ายโดยไม่ตั้งใจ การกำหนด users.manage/permissions.manage เป็นสิทธิ์สูง ต้องตรวจผู้รับก่อนให้สิทธิ์

## Isolation / migrations

แอปทุกตารางและ functions อยู่ mentor_korat เท่านั้น ไม่แตะ public เดิม Auth FK/uid เป็นการอ้างมาตรฐาน ไม่เพิ่ม triggers ใน auth Storage ใช้ API เท่านั้น ไม่มี reset หรือ destructive rollback

Migration allowlist SHA256 + schema guard + advisory lock + applied history ต้อง review source และ manifest พร้อมกัน การตรวจ regex ไม่สามารถรับรอง SQL อันตรายทุกแบบได้ จึงไม่รับ untrusted migration

## ข้อจำกัดก่อน production

- ยังต้องทดสอบ managed Supabase roles/PostgREST/Storage/SMTP จริง ไม่ถือว่า PGlite แทน integration provider ทั้งหมด
- Shared project ต้องตรวจ global storage policies และ Auth settings เดิมโดยเจ้าของ project
- ไม่รับประกัน exactly-once delivery ไป Discord ใน network ambiguity
- มีนโยบาย retention ที่ตั้งได้ แต่ไม่มี automatic deletion; กำหนดขั้นตอน purge/backup/legal hold ก่อนข้อมูลจริง
- ไม่ใช้ antivirus ภายนอกสำหรับรูปที่ decode ใหม่ ข้อจำกัดนี้ต้องอยู่ใน security review ขององค์กร
- ต้องตรวจการตั้งค่า logs และ observability เพื่อไม่บันทึก upload token URL
