CREATE SCHEMA IF NOT EXISTS mentor_korat;
CREATE TABLE mentor_korat.departments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE);
CREATE TABLE mentor_korat.app_users (id uuid PRIMARY KEY REFERENCES auth.users(id), name text NOT NULL, role text NOT NULL CHECK(role IN ('CENTER_HEAD','HR','MENTOR')), active boolean NOT NULL DEFAULT true, discord_user_id text CHECK(discord_user_id ~ '^[0-9]{15,22}$'), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.permissions (code text PRIMARY KEY);
CREATE TABLE mentor_korat.role_permissions (role text NOT NULL, permission text NOT NULL REFERENCES mentor_korat.permissions(code), PRIMARY KEY(role,permission));
CREATE TABLE mentor_korat.user_permission_overrides (user_id uuid REFERENCES mentor_korat.app_users(id), permission text REFERENCES mentor_korat.permissions(code), allowed boolean NOT NULL, PRIMARY KEY(user_id,permission));
INSERT INTO mentor_korat.permissions VALUES ('leaves.view_all'),('leaves.view_assigned'),('leaves.edit'),('evidence.precheck'),('evidence.final_review'),('evidence.reject'),('evidence.request_reupload'),('employees.manage'),('mentors.assign'),('users.manage'),('permissions.manage'),('audit.view'),('settings.manage');
INSERT INTO mentor_korat.role_permissions SELECT 'CENTER_HEAD',code FROM mentor_korat.permissions;
INSERT INTO mentor_korat.role_permissions VALUES ('HR','leaves.view_all'),('HR','evidence.final_review'),('HR','evidence.reject'),('HR','evidence.request_reupload'),('MENTOR','leaves.view_assigned'),('MENTOR','leaves.edit'),('MENTOR','evidence.precheck'),('MENTOR','evidence.request_reupload');
CREATE TABLE mentor_korat.employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL, department_id uuid NOT NULL REFERENCES mentor_korat.departments(id), mentor_id uuid REFERENCES mentor_korat.app_users(id), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.line_groups (id text PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE mentor_korat.app_settings (key text PRIMARY KEY, value jsonb NOT NULL);
INSERT INTO mentor_korat.app_settings VALUES ('leave_types','["ลาป่วย","ลากิจ","ลาพักร้อน","ลาอื่น ๆ"]'),('retention_days','365'),('discord_mode','"edit"');
CREATE TABLE mentor_korat.integration_events (id text PRIMARY KEY, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','DONE','FAILED')), attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.leave_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_number text NOT NULL UNIQUE, employee_id uuid NOT NULL REFERENCES mentor_korat.employees(id), mentor_id uuid REFERENCES mentor_korat.app_users(id), assignment_status text NOT NULL CHECK(assignment_status IN ('ASSIGNED','UNASSIGNED')), status text NOT NULL DEFAULT 'WAITING_EVIDENCE' CHECK(status IN ('WAITING_EVIDENCE','WAITING_MENTOR_REVIEW','WAITING_FINAL_REVIEW','VERIFIED','REUPLOAD_REQUIRED','REJECTED')), leave_type text NOT NULL, leave_date date NOT NULL, period text NOT NULL CHECK(period IN ('FULL','AM','PM')), reason text NOT NULL, version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.leave_raw_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leave_id uuid UNIQUE REFERENCES mentor_korat.leave_requests(id), event_id text NOT NULL UNIQUE REFERENCES mentor_korat.integration_events(id), group_id text NOT NULL, message text NOT NULL, received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.leave_parsing_issues (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id text NOT NULL REFERENCES mentor_korat.integration_events(id), issues jsonb NOT NULL, parsed jsonb, resolved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.leave_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leave_id uuid NOT NULL REFERENCES mentor_korat.leave_requests(id), actor_id uuid REFERENCES mentor_korat.app_users(id), from_status text, to_status text NOT NULL, reason text, rejection_type text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.evidence_upload_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leave_id uuid NOT NULL REFERENCES mentor_korat.leave_requests(id), token_hash text NOT NULL UNIQUE, nonce text NOT NULL, state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','USED','REVOKED')), created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX one_active_upload ON mentor_korat.evidence_upload_tokens(leave_id) WHERE state='ACTIVE';
CREATE TABLE mentor_korat.evidence_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leave_id uuid NOT NULL REFERENCES mentor_korat.leave_requests(id), path text NOT NULL UNIQUE, mime text NOT NULL, size_bytes int NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES mentor_korat.app_users(id), leave_id uuid REFERENCES mentor_korat.leave_requests(id), title text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.discord_messages (leave_id uuid PRIMARY KEY REFERENCES mentor_korat.leave_requests(id), message_id text NOT NULL);
CREATE TABLE mentor_korat.notification_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leave_id uuid REFERENCES mentor_korat.leave_requests(id), kind text NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','DONE','FAILED')), attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES mentor_korat.app_users(id), entity_id uuid, action text NOT NULL, old_data jsonb, new_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mentor_korat.rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, hits int NOT NULL);
CREATE INDEX leave_mentor_status ON mentor_korat.leave_requests(mentor_id,status,created_at DESC);
CREATE INDEX leave_date_idx ON mentor_korat.leave_requests(leave_date DESC);
CREATE INDEX leave_created_idx ON mentor_korat.leave_requests(created_at DESC);
CREATE INDEX notification_recipient ON mentor_korat.notifications(user_id,created_at DESC);
CREATE INDEX notification_unread ON mentor_korat.notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX history_leave ON mentor_korat.leave_status_history(leave_id,created_at);
CREATE INDEX evidence_leave ON mentor_korat.evidence_files(leave_id,created_at);
CREATE INDEX audit_entity ON mentor_korat.audit_logs(entity_id,created_at DESC);
CREATE INDEX event_queue ON mentor_korat.integration_events(available_at) WHERE status IN ('PENDING','PROCESSING');
CREATE INDEX outbox_queue ON mentor_korat.notification_outbox(available_at) WHERE status IN ('PENDING','PROCESSING');

CREATE FUNCTION mentor_korat.has_permission(p text, uid uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM mentor_korat.app_users u WHERE u.id=uid AND u.active AND coalesce((SELECT o.allowed FROM mentor_korat.user_permission_overrides o WHERE o.user_id=u.id AND o.permission=p),EXISTS(SELECT 1 FROM mentor_korat.role_permissions r WHERE r.role=u.role AND r.permission=p)))
$$;
CREATE FUNCTION mentor_korat.can_view(lid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM mentor_korat.leave_requests l WHERE l.id=lid AND (mentor_korat.has_permission('leaves.view_all') OR (l.mentor_id=auth.uid() AND mentor_korat.has_permission('leaves.view_assigned'))))
$$;
CREATE FUNCTION mentor_korat.audit(actor uuid, entity uuid, act text, old_value jsonb DEFAULT NULL, new_value jsonb DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO mentor_korat.audit_logs(actor_id,entity_id,action,old_data,new_data) VALUES(actor,entity,act,old_value,new_value)
$$;
CREATE FUNCTION mentor_korat.notify(lid uuid, title text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l mentor_korat.leave_requests;
BEGIN
 SELECT * INTO l FROM mentor_korat.leave_requests WHERE id=lid;
 INSERT INTO mentor_korat.notifications(user_id,leave_id,title) SELECT u.id,lid,title FROM mentor_korat.app_users u WHERE u.active AND (u.id=l.mentor_id OR (u.role='CENTER_HEAD') OR (l.status='WAITING_FINAL_REVIEW' AND mentor_korat.has_permission('evidence.final_review',u.id) AND mentor_korat.has_permission('leaves.view_all',u.id)));
 INSERT INTO mentor_korat.notification_outbox(leave_id,kind) VALUES(lid,l.status);
END $$;
CREATE FUNCTION mentor_korat.my_profile() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(u)||jsonb_build_object('permissions',(SELECT coalesce(jsonb_agg(p.code),'[]') FROM mentor_korat.permissions p WHERE mentor_korat.has_permission(p.code))) FROM mentor_korat.app_users u WHERE u.id=auth.uid() AND u.active
$$;
CREATE FUNCTION mentor_korat.dashboard_counts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('statuses',(SELECT coalesce(jsonb_object_agg(status,n),'{}') FROM (SELECT status,count(*) n FROM mentor_korat.leave_requests l WHERE mentor_korat.can_view(l.id) GROUP BY status)s),'unassigned',(SELECT count(*) FROM mentor_korat.leave_requests l WHERE mentor_korat.can_view(l.id) AND mentor_id IS NULL),'total',(SELECT count(*) FROM mentor_korat.leave_requests l WHERE mentor_korat.can_view(l.id)))
$$;
CREATE FUNCTION mentor_korat.rotate_token(lid uuid, hash text, token_nonce text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE mentor_korat.evidence_upload_tokens SET state='REVOKED' WHERE leave_id=lid AND state='ACTIVE';
 INSERT INTO mentor_korat.evidence_upload_tokens(leave_id,token_hash,nonce) VALUES(lid,hash,token_nonce);
END $$;
CREATE FUNCTION mentor_korat.review_leave(lid uuid, expected_version int, action text, reason text, rejection_type text DEFAULT NULL, token_hash text DEFAULT NULL, token_nonce text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l mentor_korat.leave_requests; next_status text; perm text; actor_role text;
BEGIN
 SELECT * INTO l FROM mentor_korat.leave_requests WHERE id=lid FOR UPDATE;
 IF NOT FOUND OR NOT mentor_korat.can_view(lid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF expected_version IS NULL OR l.version<>expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 perm:=CASE action WHEN 'precheck' THEN 'evidence.precheck' WHEN 'verify' THEN 'evidence.final_review' WHEN 'reupload' THEN 'evidence.request_reupload' WHEN 'reject' THEN 'evidence.reject' END;
 SELECT role INTO actor_role FROM mentor_korat.app_users WHERE id=auth.uid();
 IF perm IS NULL OR NOT mentor_korat.has_permission(perm) OR (actor_role='MENTOR' AND action IN ('verify','reject')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF action='precheck' AND l.status='WAITING_MENTOR_REVIEW' THEN next_status:='WAITING_FINAL_REVIEW';
 ELSIF action='verify' AND l.status='WAITING_FINAL_REVIEW' THEN next_status:='VERIFIED';
 ELSIF action='reject' AND l.status='WAITING_FINAL_REVIEW' AND rejection_type IN ('EVIDENCE','LEAVE_DATA') THEN next_status:='REJECTED';
 ELSIF action='reupload' AND l.status IN ('WAITING_MENTOR_REVIEW','WAITING_FINAL_REVIEW') THEN next_status:='REUPLOAD_REQUIRED';
 ELSE RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
 IF action IN ('reject','reupload') AND length(trim(coalesce(reason,'')))=0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 IF length(coalesce(reason,''))>2000 THEN RAISE EXCEPTION 'INVALID_REASON'; END IF;
 IF action='reupload' THEN
   IF token_hash IS NULL OR token_nonce IS NULL THEN RAISE EXCEPTION 'TOKEN_REQUIRED'; END IF;
   PERFORM mentor_korat.rotate_token(lid,token_hash,token_nonce);
 END IF;
 UPDATE mentor_korat.leave_requests SET status=next_status,version=version+1 WHERE id=lid;
 INSERT INTO mentor_korat.leave_status_history(leave_id,actor_id,from_status,to_status,reason,rejection_type) VALUES(lid,auth.uid(),l.status,next_status,reason,rejection_type);
 PERFORM mentor_korat.audit(auth.uid(),lid,'LEAVE_'||action,to_jsonb(l),jsonb_build_object('status',next_status,'reason',reason));
 PERFORM mentor_korat.notify(lid,'สถานะใบลาเปลี่ยนแปลง');
END $$;
CREATE FUNCTION mentor_korat.correct_leave(lid uuid, payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l mentor_korat.leave_requests;
BEGIN
 SELECT * INTO l FROM mentor_korat.leave_requests WHERE id=lid FOR UPDATE;
 IF NOT mentor_korat.can_view(lid) OR NOT mentor_korat.has_permission('leaves.edit') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF payload->>'version' IS NULL OR l.version<>(payload->>'version')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF l.status IN ('VERIFIED','REJECTED') OR length(trim(coalesce(payload->>'correction_reason','')))=0 THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
 UPDATE mentor_korat.leave_requests SET leave_date=(payload->>'leave_date')::date,leave_type=payload->>'leave_type',period=payload->>'period',reason=payload->>'reason',version=version+1 WHERE id=lid;
 PERFORM mentor_korat.audit(auth.uid(),lid,'LEAVE_CORRECT',to_jsonb(l),payload);
END $$;
CREATE FUNCTION mentor_korat.complete_upload(hash text, file_path text, file_size int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t mentor_korat.evidence_upload_tokens; l mentor_korat.leave_requests;
BEGIN
 SELECT * INTO t FROM mentor_korat.evidence_upload_tokens WHERE token_hash=hash FOR UPDATE;
 IF NOT FOUND OR t.state<>'ACTIVE' THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
 SELECT * INTO l FROM mentor_korat.leave_requests WHERE id=t.leave_id FOR UPDATE;
 IF l.status NOT IN ('WAITING_EVIDENCE','REUPLOAD_REQUIRED') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
 INSERT INTO mentor_korat.evidence_files(leave_id,path,mime,size_bytes) VALUES(l.id,file_path,'image/webp',file_size);
 UPDATE mentor_korat.evidence_upload_tokens SET state='USED' WHERE id=t.id;
 UPDATE mentor_korat.leave_requests SET status='WAITING_MENTOR_REVIEW',version=version+1 WHERE id=l.id;
 INSERT INTO mentor_korat.leave_status_history(leave_id,from_status,to_status) VALUES(l.id,l.status,'WAITING_MENTOR_REVIEW');
 PERFORM mentor_korat.audit(NULL,l.id,'EVIDENCE_UPLOADED');
 PERFORM mentor_korat.notify(l.id,'ได้รับหลักฐานใหม่แล้ว');
 RETURN l.id;
END $$;
CREATE FUNCTION mentor_korat.ingest_leave(event_id text, parsed jsonb, hash text, token_nonce text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e mentor_korat.integration_events; emp mentor_korat.employees; lid uuid; issues jsonb;
BEGIN
 SELECT * INTO e FROM mentor_korat.integration_events WHERE id=event_id FOR UPDATE;
 IF e.status='DONE' THEN RETURN; END IF;
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
 UPDATE mentor_korat.integration_events SET status='DONE',locked_until=NULL WHERE id=event_id;
END $$;
CREATE FUNCTION mentor_korat.claim_jobs(queue text) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF queue='line' THEN
 RETURN QUERY WITH jobs AS (SELECT id FROM mentor_korat.integration_events WHERE ((status='PENDING' AND available_at<=now()) OR (status='PROCESSING' AND locked_until<now())) AND attempts<8 ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) UPDATE mentor_korat.integration_events e SET status='PROCESSING',locked_until=now()+interval '5 minutes',attempts=attempts+1 FROM jobs WHERE e.id=jobs.id RETURNING to_jsonb(e);
 ELSIF queue='discord' THEN
 RETURN QUERY WITH jobs AS (SELECT id FROM mentor_korat.notification_outbox WHERE ((status='PENDING' AND available_at<=now()) OR (status='PROCESSING' AND locked_until<now())) AND attempts<8 ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) UPDATE mentor_korat.notification_outbox e SET status='PROCESSING',locked_until=now()+interval '5 minutes',attempts=attempts+1 FROM jobs WHERE e.id=jobs.id RETURNING to_jsonb(e);
 END IF;
END $$;
CREATE FUNCTION mentor_korat.rate_limit(k text, max_hits int, seconds int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n int;
BEGIN
 INSERT INTO mentor_korat.rate_limits(key,window_start,hits) VALUES(k,now(),1) ON CONFLICT(key) DO UPDATE SET window_start=CASE WHEN mentor_korat.rate_limits.window_start<now()-make_interval(secs=>seconds) THEN now() ELSE mentor_korat.rate_limits.window_start END,hits=CASE WHEN mentor_korat.rate_limits.window_start<now()-make_interval(secs=>seconds) THEN 1 ELSE mentor_korat.rate_limits.hits+1 END RETURNING hits INTO n;
 RETURN n<=max_hits;
END $$;
CREATE FUNCTION mentor_korat.manage_entity(kind text, payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid; prior jsonb; mid uuid; ids uuid[];
BEGIN
 IF kind='employee' AND mentor_korat.has_permission('employees.manage') THEN
   eid:=coalesce((payload->>'id')::uuid,gen_random_uuid()); mid:=(payload->>'mentor_id')::uuid;
   IF mid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=mid AND active AND role='MENTOR') THEN RAISE EXCEPTION 'INVALID_MENTOR'; END IF;
   SELECT to_jsonb(e) INTO prior FROM mentor_korat.employees e WHERE id=eid;
   IF prior IS NOT NULL AND (prior->>'mentor_id') IS DISTINCT FROM (payload->>'mentor_id') AND NOT mentor_korat.has_permission('mentors.assign') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF prior IS NULL AND mid IS NOT NULL AND NOT mentor_korat.has_permission('mentors.assign') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   INSERT INTO mentor_korat.employees(id,code,name,department_id,mentor_id,active) VALUES(eid,payload->>'code',payload->>'name',(payload->>'department_id')::uuid,mid,(payload->>'active')::boolean) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,department_id=excluded.department_id,mentor_id=excluded.mentor_id,active=excluded.active;
 ELSIF kind='assignment' AND mentor_korat.has_permission('mentors.assign') THEN
   mid:=(payload->>'mentor_id')::uuid;
   IF mid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=mid AND active AND role='MENTOR') THEN RAISE EXCEPTION 'INVALID_MENTOR'; END IF;
   SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(payload->'employee_ids');
   FOR eid IN SELECT id FROM mentor_korat.employees WHERE id=ANY(ids) FOR UPDATE LOOP
     SELECT to_jsonb(e) INTO prior FROM mentor_korat.employees e WHERE id=eid;
     UPDATE mentor_korat.employees SET mentor_id=mid WHERE id=eid;
     PERFORM mentor_korat.audit(auth.uid(),eid,'MENTOR_ASSIGNED',prior,payload);
   END LOOP;
 ELSIF kind='user' AND mentor_korat.has_permission('users.manage') THEN
   eid:=(payload->>'id')::uuid;
   IF eid=auth.uid() THEN RAISE EXCEPTION 'CANNOT_EDIT_SELF'; END IF;
   SELECT to_jsonb(u) INTO prior FROM mentor_korat.app_users u WHERE id=eid;
   IF (payload->>'role') NOT IN ('CENTER_HEAD','HR','MENTOR') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
   INSERT INTO mentor_korat.app_users(id,name,role,active,discord_user_id) VALUES(eid,payload->>'name',payload->>'role',(payload->>'active')::boolean,nullif(payload->>'discord_user_id','')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active,discord_user_id=excluded.discord_user_id;
 ELSIF kind='permission' AND mentor_korat.has_permission('permissions.manage') THEN
   eid:=(payload->>'user_id')::uuid;
   IF eid=auth.uid() THEN RAISE EXCEPTION 'CANNOT_EDIT_SELF'; END IF;
   INSERT INTO mentor_korat.user_permission_overrides(user_id,permission,allowed) VALUES(eid,payload->>'permission',(payload->>'allowed')::boolean) ON CONFLICT(user_id,permission) DO UPDATE SET allowed=excluded.allowed;
 ELSIF kind='department' AND mentor_korat.has_permission('employees.manage') THEN
   INSERT INTO mentor_korat.departments(name) VALUES(payload->>'name') ON CONFLICT DO NOTHING;
 ELSIF kind='line_group' AND mentor_korat.has_permission('settings.manage') THEN
   INSERT INTO mentor_korat.line_groups(id,name,active) VALUES(payload->>'id',payload->>'name',(payload->>'active')::boolean) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active;
 ELSIF kind='setting' AND mentor_korat.has_permission('settings.manage') AND payload->>'key' IN ('leave_types','retention_days','discord_mode') THEN
   INSERT INTO mentor_korat.app_settings(key,value) VALUES(payload->>'key',payload->'value') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 ELSE RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF kind IN ('employee','assignment') THEN
   FOR eid IN SELECT l.id FROM mentor_korat.leave_requests l JOIN mentor_korat.employees e ON e.id=l.employee_id WHERE l.status NOT IN ('VERIFIED','REJECTED') AND l.mentor_id IS DISTINCT FROM e.mentor_id FOR UPDATE OF l LOOP
     UPDATE mentor_korat.leave_requests l SET mentor_id=e.mentor_id,assignment_status=CASE WHEN e.mentor_id IS NULL THEN 'UNASSIGNED' ELSE 'ASSIGNED' END,version=l.version+1 FROM mentor_korat.employees e WHERE l.id=eid AND e.id=l.employee_id;
     PERFORM mentor_korat.notify(eid,'เปลี่ยน Mentor ผู้รับผิดชอบแล้ว');
   END LOOP;
 END IF;
 PERFORM mentor_korat.audit(auth.uid(),eid,'MANAGE_'||kind,prior,payload);
END $$;
CREATE FUNCTION mentor_korat.mark_notifications(nid uuid DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ UPDATE mentor_korat.notifications SET read_at=now() WHERE user_id=auth.uid() AND (nid IS NULL OR id=nid) AND mentor_korat.has_permission('leaves.view_assigned') OR false $$;
-- Replace body to include all active roles and maintain strict recipient scope.
CREATE OR REPLACE FUNCTION mentor_korat.mark_notifications(nid uuid DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ UPDATE mentor_korat.notifications SET read_at=now() WHERE user_id=auth.uid() AND (nid IS NULL OR id=nid) AND EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active) $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['departments','app_users','permissions','role_permissions','user_permission_overrides','employees','line_groups','app_settings','integration_events','leave_requests','leave_raw_messages','leave_parsing_issues','leave_status_history','evidence_upload_tokens','evidence_files','notifications','discord_messages','notification_outbox','audit_logs','rate_limits'] LOOP
 EXECUTE format('ALTER TABLE mentor_korat.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE POLICY profile_read ON mentor_korat.app_users FOR SELECT TO authenticated USING (id=auth.uid() OR mentor_korat.has_permission('users.manage') OR mentor_korat.has_permission('mentors.assign'));
CREATE POLICY departments_read ON mentor_korat.departments FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active));
CREATE POLICY employees_read ON mentor_korat.employees FOR SELECT TO authenticated USING (mentor_korat.has_permission('employees.manage') OR mentor_korat.has_permission('leaves.view_all') OR (mentor_id=auth.uid() AND mentor_korat.has_permission('leaves.view_assigned')));
CREATE POLICY leaves_read ON mentor_korat.leave_requests FOR SELECT TO authenticated USING (mentor_korat.can_view(id));
CREATE POLICY raw_read ON mentor_korat.leave_raw_messages FOR SELECT TO authenticated USING (mentor_korat.can_view(leave_id));
CREATE POLICY history_read ON mentor_korat.leave_status_history FOR SELECT TO authenticated USING (mentor_korat.can_view(leave_id));
CREATE POLICY evidence_read ON mentor_korat.evidence_files FOR SELECT TO authenticated USING (mentor_korat.can_view(leave_id));
CREATE POLICY notification_read ON mentor_korat.notifications FOR SELECT TO authenticated USING (user_id=auth.uid() AND EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active));
CREATE POLICY audit_read ON mentor_korat.audit_logs FOR SELECT TO authenticated USING (mentor_korat.has_permission('audit.view') OR mentor_korat.can_view(entity_id));
CREATE POLICY groups_read ON mentor_korat.line_groups FOR SELECT TO authenticated USING (mentor_korat.has_permission('settings.manage'));
CREATE POLICY settings_read ON mentor_korat.app_settings FOR SELECT TO authenticated USING (mentor_korat.has_permission('settings.manage'));
CREATE POLICY issues_read ON mentor_korat.leave_parsing_issues FOR SELECT TO authenticated USING (mentor_korat.has_permission('settings.manage') OR mentor_korat.has_permission('leaves.view_all'));
CREATE POLICY override_read ON mentor_korat.user_permission_overrides FOR SELECT TO authenticated USING (user_id=auth.uid() OR mentor_korat.has_permission('permissions.manage'));
CREATE POLICY events_read ON mentor_korat.integration_events FOR SELECT TO authenticated USING (mentor_korat.has_permission('settings.manage'));
CREATE POLICY outbox_read ON mentor_korat.notification_outbox FOR SELECT TO authenticated USING (mentor_korat.has_permission('settings.manage'));
GRANT USAGE ON SCHEMA mentor_korat TO authenticated,service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA mentor_korat TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA mentor_korat TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mentor_korat FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mentor_korat.has_permission(text,uuid), mentor_korat.can_view(uuid), mentor_korat.my_profile(), mentor_korat.dashboard_counts(), mentor_korat.review_leave(uuid,int,text,text,text,text,text), mentor_korat.correct_leave(uuid,jsonb), mentor_korat.manage_entity(text,jsonb), mentor_korat.mark_notifications(uuid) TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mentor_korat TO service_role;
