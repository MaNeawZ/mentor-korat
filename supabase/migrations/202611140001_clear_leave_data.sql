INSERT INTO mentor_korat.permissions(code) VALUES('data.clear') ON CONFLICT DO NOTHING;
INSERT INTO mentor_korat.role_permissions(role,permission) VALUES('CENTER_HEAD','data.clear') ON CONFLICT DO NOTHING;

CREATE TABLE mentor_korat.cleared_line_events (
 id text PRIMARY KEY,
 cleared_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mentor_korat.cleared_line_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mentor_korat.cleared_line_events TO service_role;

CREATE TABLE mentor_korat.storage_cleanup_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 path text NOT NULL UNIQUE CHECK(path ~ '^[0-9a-f-]{36}/[0-9A-Za-z_-]+\.webp$'),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','DONE','FAILED')),
 attempts int NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mentor_korat.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON mentor_korat.storage_cleanup_jobs TO authenticated;
GRANT ALL ON mentor_korat.storage_cleanup_jobs TO service_role;
CREATE INDEX cleanup_pending ON mentor_korat.storage_cleanup_jobs(available_at) WHERE status IN ('PENDING','PROCESSING');
CREATE POLICY cleanup_read ON mentor_korat.storage_cleanup_jobs FOR SELECT TO authenticated USING(
 mentor_korat.has_permission('data.clear') AND EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND role='CENTER_HEAD' AND active)
);

CREATE FUNCTION mentor_korat.ignore_cleared_line_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM mentor_korat.cleared_line_events WHERE id=NEW.id) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mentor_korat.ignore_cleared_line_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ignore_cleared_event BEFORE INSERT ON mentor_korat.integration_events FOR EACH ROW EXECUTE FUNCTION mentor_korat.ignore_cleared_line_event();

CREATE FUNCTION mentor_korat.leave_data_snapshot() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('counts',jsonb_object_agg(kind,n),'snapshot',md5(string_agg(kind||':'||digest,'|' ORDER BY kind))) FROM (
 SELECT 'leaves' kind,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) digest FROM mentor_korat.leave_requests t
 UNION ALL SELECT 'evidence',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM mentor_korat.evidence_files t
 UNION ALL SELECT 'upload_links',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM mentor_korat.evidence_upload_tokens t
 UNION ALL SELECT 'reviews',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM mentor_korat.leave_status_history t
 UNION ALL SELECT 'notifications',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM mentor_korat.notifications t
 UNION ALL SELECT 'discord_links',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY leave_id),'')) FROM mentor_korat.discord_messages t
 UNION ALL SELECT 'discord_queue',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM mentor_korat.notification_outbox t
 UNION ALL SELECT 'line_messages',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM mentor_korat.leave_raw_messages t
 UNION ALL SELECT 'parsing_issues',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM mentor_korat.leave_parsing_issues t
 UNION ALL SELECT 'line_events',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM mentor_korat.integration_events t
 ) summary
$$;
REVOKE ALL ON FUNCTION mentor_korat.leave_data_snapshot() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION mentor_korat.preview_leave_data_clear() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE preview jsonb;
BEGIN
 IF NOT mentor_korat.has_permission('data.clear') OR NOT EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active AND role='CENTER_HEAD') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 preview:=mentor_korat.leave_data_snapshot();
 RETURN preview||jsonb_build_object('storage_pending',(SELECT count(*) FROM mentor_korat.storage_cleanup_jobs WHERE status<>'DONE'),'storage_failed',(SELECT count(*) FROM mentor_korat.storage_cleanup_jobs WHERE status='FAILED'));
END $$;
REVOKE ALL ON FUNCTION mentor_korat.preview_leave_data_clear() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.preview_leave_data_clear() TO authenticated;

CREATE FUNCTION mentor_korat.clear_leave_data(expected_snapshot text, confirmation text, reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 INSERT INTO mentor_korat.storage_cleanup_jobs(path) SELECT path FROM mentor_korat.evidence_files ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS cleanup_count=ROW_COUNT;
 DELETE FROM mentor_korat.evidence_files;
 DELETE FROM mentor_korat.evidence_upload_tokens;
 DELETE FROM mentor_korat.leave_status_history;
 DELETE FROM mentor_korat.notifications;
 DELETE FROM mentor_korat.discord_messages;
 DELETE FROM mentor_korat.notification_outbox;
 DELETE FROM mentor_korat.leave_raw_messages;
 DELETE FROM mentor_korat.leave_parsing_issues;
 DELETE FROM mentor_korat.leave_requests;
 DELETE FROM mentor_korat.integration_events;
 PERFORM mentor_korat.audit(auth.uid(),NULL,'DATA_CLEAR_LEAVES',NULL,jsonb_build_object('reason',trim(reason),'deleted',preview->'counts','files_queued',cleanup_count));
 RETURN jsonb_build_object('cleared',preview->'counts','storage_pending',(SELECT count(*) FROM mentor_korat.storage_cleanup_jobs WHERE status<>'DONE'));
END $$;
REVOKE ALL ON FUNCTION mentor_korat.clear_leave_data(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.clear_leave_data(text,text,text) TO authenticated;

CREATE FUNCTION mentor_korat.claim_storage_cleanup() RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE mentor_korat.storage_cleanup_jobs SET status='FAILED',error_code='LEASE_EXHAUSTED' WHERE status='PROCESSING' AND locked_until<now() AND attempts>=8;
 RETURN QUERY WITH jobs AS (
 SELECT id FROM mentor_korat.storage_cleanup_jobs WHERE ((status='PENDING' AND available_at<=now()) OR (status='PROCESSING' AND locked_until<now())) AND attempts<8 ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED
 ) UPDATE mentor_korat.storage_cleanup_jobs e SET status='PROCESSING',locked_until=now()+interval '5 minutes',attempts=attempts+1 FROM jobs WHERE e.id=jobs.id RETURNING to_jsonb(e);
END $$;
REVOKE ALL ON FUNCTION mentor_korat.claim_storage_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mentor_korat.claim_storage_cleanup() TO service_role;

CREATE FUNCTION mentor_korat.retry_storage_cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT mentor_korat.has_permission('data.clear') OR NOT EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active AND role='CENTER_HEAD') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 UPDATE mentor_korat.storage_cleanup_jobs SET status='PENDING',attempts=0,available_at=now(),error_code=NULL WHERE status='FAILED';
 PERFORM mentor_korat.audit(auth.uid(),NULL,'STORAGE_CLEANUP_RETRY');
END $$;
REVOKE ALL ON FUNCTION mentor_korat.retry_storage_cleanup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.retry_storage_cleanup() TO authenticated;

CREATE OR REPLACE FUNCTION mentor_korat.ingest_leave(event_id text, parsed jsonb, hash text, token_nonce text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e mentor_korat.integration_events; emp mentor_korat.employees; lid uuid; issues jsonb;
BEGIN
 SELECT * INTO e FROM mentor_korat.integration_events WHERE id=event_id FOR UPDATE;
 IF NOT FOUND OR e.status='DONE' THEN RETURN; END IF;
 SELECT * INTO emp FROM mentor_korat.employees WHERE code=parsed->>'employee_code' AND active;
 issues:=coalesce(parsed->'issues','[]');
 IF emp.id IS NULL THEN issues:=issues||'"UNKNOWN_EMPLOYEE"'::jsonb;
 ELSIF regexp_replace(emp.name,'\s','','g')<>regexp_replace(parsed->>'employee_name','\s','','g') THEN issues:=issues||'"NAME_MISMATCH"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM mentor_korat.leave_requests WHERE document_number=parsed->>'document_number') THEN issues:=issues||'"DUPLICATE_DOCUMENT"'::jsonb; END IF;
 IF jsonb_array_length(issues)>0 THEN
 INSERT INTO mentor_korat.leave_parsing_issues(event_id,issues,parsed) VALUES(event_id,issues,parsed);
 INSERT INTO mentor_korat.notifications(user_id,title) SELECT id,'ข้อความ LINE ต้องตรวจสอบเพิ่มเติม' FROM mentor_korat.app_users WHERE active AND (role='CENTER_HEAD' OR id=emp.mentor_id);
 ELSE
 INSERT INTO mentor_korat.leave_requests(document_number,employee_id,mentor_id,assignment_status,leave_type,leave_date,period,reason) VALUES(parsed->>'document_number',emp.id,emp.mentor_id,CASE WHEN emp.mentor_id IS NULL THEN 'UNASSIGNED' ELSE 'ASSIGNED' END,parsed->>'leave_type',(parsed->>'leave_date')::date,parsed->>'period',parsed->>'reason') ON CONFLICT(document_number) DO NOTHING RETURNING id INTO lid;
 IF lid IS NOT NULL THEN
 INSERT INTO mentor_korat.leave_raw_messages(leave_id,event_id,group_id,message) VALUES(lid,event_id,e.payload->'source'->>'groupId',e.payload->'message'->>'text');
 PERFORM mentor_korat.rotate_token(lid,hash,token_nonce);
 INSERT INTO mentor_korat.leave_status_history(leave_id,to_status) VALUES(lid,'WAITING_EVIDENCE');
 PERFORM mentor_korat.audit(NULL,lid,'LINE_LEAVE_CREATED');
 PERFORM mentor_korat.notify(lid,CASE WHEN emp.mentor_id IS NULL THEN 'มีใบลารอมอบหมาย Mentor' ELSE 'ได้รับใบลาใหม่' END);
 END IF;
 END IF;
 UPDATE mentor_korat.integration_events SET status='DONE',locked_until=NULL,error_code=NULL WHERE id=event_id;
END $$;
