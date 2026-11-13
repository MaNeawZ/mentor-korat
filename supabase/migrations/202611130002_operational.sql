CREATE FUNCTION mentor_korat.mentor_counts() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT mentor_korat.has_permission('mentors.assign') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(s),'[]') FROM (SELECT u.id,u.name,u.active,count(e.id) employee_count FROM mentor_korat.app_users u LEFT JOIN mentor_korat.employees e ON e.mentor_id=u.id AND e.active WHERE u.role='MENTOR' GROUP BY u.id ORDER BY u.name)s);
END $$;
REVOKE ALL ON FUNCTION mentor_korat.mentor_counts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.mentor_counts() TO authenticated,service_role;
CREATE FUNCTION mentor_korat.requeue_failed(queue text, job_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT mentor_korat.has_permission('settings.manage') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF queue='line' THEN UPDATE mentor_korat.integration_events SET status='PENDING',attempts=0,available_at=now(),error_code=NULL WHERE id=job_id AND status='FAILED';
 ELSIF queue='discord' THEN UPDATE mentor_korat.notification_outbox SET status='PENDING',attempts=0,available_at=now(),error_code=NULL WHERE id=job_id::uuid AND status='FAILED';
 ELSE RAISE EXCEPTION 'INVALID_QUEUE'; END IF;
 PERFORM mentor_korat.audit(auth.uid(),NULL,'REQUEUE_'||queue,NULL,jsonb_build_object('job_id',job_id));
END $$;
REVOKE ALL ON FUNCTION mentor_korat.requeue_failed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.requeue_failed(text,text) TO authenticated,service_role;
