-- Explicit primary-key predicates support API sessions with safeupdate enabled.
-- Scope remains all rows reviewed under the existing exclusive locks.
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
 INSERT INTO mentor_korat.storage_cleanup_jobs(path) SELECT path FROM mentor_korat.evidence_files ON CONFLICT DO NOTHING;
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

