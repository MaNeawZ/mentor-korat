ALTER TABLE mentor_korat.employees ADD CONSTRAINT employee_code_format CHECK(code ~ '^[0-9]{3,12}$'), ADD CONSTRAINT employee_name_length CHECK(length(trim(name)) BETWEEN 2 AND 160);
ALTER TABLE mentor_korat.app_users ADD CONSTRAINT user_name_length CHECK(length(trim(name)) BETWEEN 2 AND 160);
ALTER TABLE mentor_korat.evidence_files ADD CONSTRAINT evidence_size CHECK(size_bytes BETWEEN 1 AND 8388608), ADD CONSTRAINT evidence_path CHECK(path LIKE leave_id::text||'/%' AND path ~ '\.webp$');
ALTER TABLE mentor_korat.evidence_upload_tokens ADD CONSTRAINT token_hash_format CHECK(token_hash ~ '^[0-9a-f]{64}$'), ADD CONSTRAINT token_nonce_format CHECK(nonce ~ '^[0-9a-f]{64}$');
ALTER TABLE mentor_korat.leave_requests ADD CONSTRAINT document_format CHECK(document_number ~ '^LE-[0-9]{8,20}$'), ADD CONSTRAINT reason_length CHECK(length(trim(reason)) BETWEEN 1 AND 2000), ADD CONSTRAINT leave_type_length CHECK(length(trim(leave_type)) BETWEEN 1 AND 60);
ALTER TABLE mentor_korat.departments ADD CONSTRAINT department_name_length CHECK(length(trim(name)) BETWEEN 1 AND 80);
ALTER TABLE mentor_korat.line_groups ADD CONSTRAINT line_group_format CHECK(id ~ '^C[0-9a-fA-F]{32}$');
CREATE POLICY assignment_employee_read ON mentor_korat.employees FOR SELECT TO authenticated USING(mentor_korat.has_permission('mentors.assign'));
CREATE OR REPLACE FUNCTION mentor_korat.claim_jobs(queue text) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF queue='line' THEN
 UPDATE mentor_korat.integration_events SET status='FAILED',error_code='LEASE_EXHAUSTED' WHERE status='PROCESSING' AND locked_until<now() AND attempts>=8;
 RETURN QUERY WITH jobs AS (SELECT id FROM mentor_korat.integration_events WHERE ((status='PENDING' AND available_at<=now()) OR (status='PROCESSING' AND locked_until<now())) AND attempts<8 ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) UPDATE mentor_korat.integration_events e SET status='PROCESSING',locked_until=now()+interval '5 minutes',attempts=attempts+1 FROM jobs WHERE e.id=jobs.id RETURNING to_jsonb(e);
 ELSIF queue='discord' THEN
 PERFORM pg_advisory_xact_lock(680318412);
 UPDATE mentor_korat.notification_outbox SET status='FAILED',error_code='LEASE_EXHAUSTED' WHERE status='PROCESSING' AND locked_until<now() AND attempts>=8;
 IF EXISTS(SELECT 1 FROM mentor_korat.notification_outbox WHERE status='PROCESSING' AND locked_until>now()) THEN RETURN; END IF;
 RETURN QUERY WITH jobs AS (SELECT id FROM mentor_korat.notification_outbox WHERE ((status='PENDING' AND available_at<=now()) OR (status='PROCESSING' AND locked_until<now())) AND attempts<8 ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED) UPDATE mentor_korat.notification_outbox e SET status='PROCESSING',locked_until=now()+interval '5 minutes',attempts=attempts+1 FROM jobs WHERE e.id=jobs.id RETURNING to_jsonb(e);
 END IF;
END $$;
