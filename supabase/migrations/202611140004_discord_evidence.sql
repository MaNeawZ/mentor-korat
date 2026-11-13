ALTER TABLE mentor_korat.evidence_files
 ADD COLUMN provider text NOT NULL DEFAULT 'supabase' CHECK(provider IN ('supabase','discord')),
 ADD COLUMN discord_webhook_id text,
 ADD COLUMN discord_message_id text,
 ADD COLUMN discord_attachment_id text,
 ADD CONSTRAINT discord_evidence_reference CHECK(provider<>'discord' OR (
 discord_webhook_id IS NOT NULL AND discord_webhook_id ~ '^[0-9]{15,22}$' AND
 discord_message_id IS NOT NULL AND discord_message_id ~ '^[0-9]{15,22}$' AND
 discord_attachment_id IS NOT NULL AND discord_attachment_id ~ '^[0-9]{15,22}$'));
ALTER TABLE mentor_korat.storage_cleanup_jobs
 ADD COLUMN provider text NOT NULL DEFAULT 'supabase' CHECK(provider IN ('supabase','discord')),
 ADD COLUMN discord_webhook_id text,
 ADD COLUMN discord_message_id text,
 ADD CONSTRAINT discord_cleanup_reference CHECK(provider<>'discord' OR (
 discord_webhook_id IS NOT NULL AND discord_webhook_id ~ '^[0-9]{15,22}$' AND
 discord_message_id IS NOT NULL AND discord_message_id ~ '^[0-9]{15,22}$'));

CREATE FUNCTION mentor_korat.discord_evidence_ready() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION mentor_korat.discord_evidence_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mentor_korat.discord_evidence_ready() TO service_role;

CREATE FUNCTION mentor_korat.complete_discord_upload(hash text,file_path text,file_size int,webhook_id text,message_id text,attachment_id text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t mentor_korat.evidence_upload_tokens; l mentor_korat.leave_requests;
BEGIN
 SELECT * INTO t FROM mentor_korat.evidence_upload_tokens WHERE token_hash=hash FOR UPDATE;
 IF NOT FOUND OR t.state<>'ACTIVE' THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
 SELECT * INTO l FROM mentor_korat.leave_requests WHERE id=t.leave_id FOR UPDATE;
 IF l.status NOT IN ('WAITING_EVIDENCE','REUPLOAD_REQUIRED') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
 IF file_path IS NULL OR file_path !~ ('^'||l.id::text||'/[0-9a-f-]{36}\.webp$') OR webhook_id IS NULL OR webhook_id !~ '^[0-9]{15,22}$' OR message_id IS NULL OR message_id !~ '^[0-9]{15,22}$' OR attachment_id IS NULL OR attachment_id !~ '^[0-9]{15,22}$' THEN RAISE EXCEPTION 'INVALID_DISCORD_REFERENCE'; END IF;
 INSERT INTO mentor_korat.evidence_files(leave_id,path,mime,size_bytes,provider,discord_webhook_id,discord_message_id,discord_attachment_id) VALUES(l.id,file_path,'image/webp',file_size,'discord',webhook_id,message_id,attachment_id);
 UPDATE mentor_korat.evidence_upload_tokens SET state='USED' WHERE id=t.id;
 UPDATE mentor_korat.leave_requests SET status='WAITING_MENTOR_REVIEW',version=version+1 WHERE id=l.id;
 INSERT INTO mentor_korat.leave_status_history(leave_id,from_status,to_status) VALUES(l.id,l.status,'WAITING_MENTOR_REVIEW');
 PERFORM mentor_korat.audit(NULL,l.id,'EVIDENCE_UPLOADED',NULL,jsonb_build_object('provider','discord','message_id',message_id));
 PERFORM mentor_korat.notify(l.id,'ได้รับหลักฐานใหม่แล้ว');
 RETURN l.id;
END $$;
REVOKE ALL ON FUNCTION mentor_korat.complete_discord_upload(text,text,int,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mentor_korat.complete_discord_upload(text,text,int,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION mentor_korat.clear_leave_data(expected_snapshot text, confirmation text, reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE preview jsonb; cleanup_count int;
BEGIN
 IF NOT mentor_korat.has_permission('data.clear') OR NOT EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active AND role='CENTER_HEAD') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF confirmation IS DISTINCT FROM 'ล้างข้อมูลใบลา' OR length(trim(coalesce(reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_CLEAR_CONFIRMATION'; END IF;
 IF NOT pg_try_advisory_xact_lock(680318413) THEN RAISE EXCEPTION 'CLEAR_BUSY'; END IF;
 PERFORM set_config('lock_timeout','3s',true);
 LOCK TABLE mentor_korat.integration_events,mentor_korat.leave_requests,mentor_korat.leave_raw_messages,
 mentor_korat.leave_parsing_issues,mentor_korat.leave_status_history,mentor_korat.evidence_upload_tokens,
 mentor_korat.evidence_files,mentor_korat.notifications,mentor_korat.discord_messages,mentor_korat.notification_outbox IN EXCLUSIVE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM mentor_korat.integration_events WHERE status='PROCESSING' AND locked_until>now()) OR EXISTS(SELECT 1 FROM mentor_korat.notification_outbox WHERE status='PROCESSING' AND locked_until>now()) THEN RAISE EXCEPTION 'CLEAR_BUSY'; END IF;
 preview:=mentor_korat.leave_data_snapshot();
 IF expected_snapshot IS DISTINCT FROM preview->>'snapshot' THEN RAISE EXCEPTION 'STALE_CLEAR_PREVIEW'; END IF;
 INSERT INTO mentor_korat.cleared_line_events(id) SELECT id FROM mentor_korat.integration_events ON CONFLICT DO NOTHING;
 INSERT INTO mentor_korat.storage_cleanup_jobs(path,provider,discord_webhook_id,discord_message_id) SELECT path,provider,discord_webhook_id,discord_message_id FROM mentor_korat.evidence_files ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS cleanup_count=ROW_COUNT;
 DELETE FROM mentor_korat.evidence_files WHERE id IS NOT NULL;
 DELETE FROM mentor_korat.evidence_upload_tokens WHERE id IS NOT NULL;
 DELETE FROM mentor_korat.leave_status_history WHERE id IS NOT NULL;
 DELETE FROM mentor_korat.notifications WHERE id IS NOT NULL;
 DELETE FROM mentor_korat.discord_messages WHERE leave_id IS NOT NULL;
 DELETE FROM mentor_korat.notification_outbox WHERE id IS NOT NULL;
 DELETE FROM mentor_korat.leave_raw_messages WHERE id IS NOT NULL;
 DELETE FROM mentor_korat.leave_parsing_issues WHERE id IS NOT NULL;
 DELETE FROM mentor_korat.leave_requests WHERE id IS NOT NULL;
 DELETE FROM mentor_korat.integration_events WHERE id IS NOT NULL;
 PERFORM mentor_korat.audit(auth.uid(),NULL,'DATA_CLEAR_LEAVES',NULL,jsonb_build_object('reason',trim(reason),'deleted',preview->'counts','files_queued',cleanup_count));
 RETURN jsonb_build_object('cleared',preview->'counts','storage_pending',(SELECT count(*) FROM mentor_korat.storage_cleanup_jobs WHERE status<>'DONE'));
END $$;
REVOKE ALL ON FUNCTION mentor_korat.clear_leave_data(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.clear_leave_data(text,text,text) TO authenticated;


CREATE OR REPLACE FUNCTION mentor_korat.claim_storage_cleanup() RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE mentor_korat.storage_cleanup_jobs SET status='FAILED',error_code='LEASE_EXHAUSTED' WHERE status='PROCESSING' AND locked_until<now() AND attempts>=8;
 RETURN QUERY WITH jobs AS (
 SELECT id FROM mentor_korat.storage_cleanup_jobs WHERE ((status='PENDING' AND available_at<=now()) OR (status='PROCESSING' AND locked_until<now())) AND attempts<8 ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
 ) UPDATE mentor_korat.storage_cleanup_jobs e SET status='PROCESSING',locked_until=now()+interval '5 minutes',attempts=attempts+1 FROM jobs WHERE e.id=jobs.id RETURNING to_jsonb(e);
END $$;
REVOKE ALL ON FUNCTION mentor_korat.claim_storage_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mentor_korat.claim_storage_cleanup() TO service_role;

