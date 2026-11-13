CREATE FUNCTION mentor_korat.audit_clear_snapshot() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('count',count(*),'snapshot',md5(coalesce(string_agg(to_jsonb(a)::text,'|' ORDER BY id),''))) FROM mentor_korat.audit_logs a
$$;
REVOKE ALL ON FUNCTION mentor_korat.audit_clear_snapshot() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION mentor_korat.preview_audit_clear() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT mentor_korat.has_permission('data.clear') OR NOT EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active AND role='CENTER_HEAD') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN mentor_korat.audit_clear_snapshot();
END $$;
REVOKE ALL ON FUNCTION mentor_korat.preview_audit_clear() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.preview_audit_clear() TO authenticated;

CREATE FUNCTION mentor_korat.clear_audit_history(expected_snapshot text,confirmation text,reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE preview jsonb; deleted_count bigint;
BEGIN
 IF NOT mentor_korat.has_permission('data.clear') OR NOT EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active AND role='CENTER_HEAD') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF confirmation IS DISTINCT FROM 'ล้างประวัติการดำเนินการ' OR length(trim(coalesce(reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_CLEAR_CONFIRMATION'; END IF;
 IF NOT pg_try_advisory_xact_lock(680318414) THEN RAISE EXCEPTION 'CLEAR_BUSY'; END IF;
 PERFORM set_config('lock_timeout','3s',true);
 LOCK TABLE mentor_korat.audit_logs IN EXCLUSIVE MODE NOWAIT;
 preview:=mentor_korat.audit_clear_snapshot();
 IF expected_snapshot IS DISTINCT FROM preview->>'snapshot' THEN RAISE EXCEPTION 'STALE_CLEAR_PREVIEW'; END IF;
 DELETE FROM mentor_korat.audit_logs WHERE id IS NOT NULL;
 GET DIAGNOSTICS deleted_count=ROW_COUNT;
 PERFORM mentor_korat.audit(auth.uid(),NULL,'DATA_CLEAR_AUDIT_HISTORY',NULL,jsonb_build_object('reason',trim(reason),'deleted_count',deleted_count));
 RETURN jsonb_build_object('cleared',deleted_count,'retained',1);
END $$;
REVOKE ALL ON FUNCTION mentor_korat.clear_audit_history(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.clear_audit_history(text,text,text) TO authenticated;
