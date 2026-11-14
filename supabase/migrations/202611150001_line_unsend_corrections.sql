ALTER TABLE mentor_korat.leave_requests ADD COLUMN line_retracted boolean NOT NULL DEFAULT false;
ALTER TABLE mentor_korat.leave_raw_messages ADD COLUMN line_message_id text,ADD COLUMN line_user_id text,ADD COLUMN line_timestamp bigint,ADD COLUMN retracted_at timestamptz;
UPDATE mentor_korat.leave_raw_messages r SET line_message_id=e.payload->'message'->>'id',line_user_id=e.payload->'source'->>'userId',line_timestamp=CASE WHEN e.payload->>'timestamp' ~ '^[0-9]{1,16}$' THEN (e.payload->>'timestamp')::bigint END FROM mentor_korat.integration_events e WHERE e.id=r.event_id;
CREATE INDEX raw_line_message_lookup ON mentor_korat.leave_raw_messages(group_id,line_message_id);
CREATE TABLE mentor_korat.line_unsent_messages(group_id text NOT NULL,message_id text NOT NULL,unsent_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(group_id,message_id));
ALTER TABLE mentor_korat.line_unsent_messages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mentor_korat.line_unsent_messages TO service_role;

CREATE FUNCTION mentor_korat.notify_line_change(lid uuid,title text,kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l mentor_korat.leave_requests;
BEGIN
 SELECT * INTO l FROM mentor_korat.leave_requests WHERE id=lid;
 INSERT INTO mentor_korat.notifications(user_id,leave_id,title) SELECT id,lid,title FROM mentor_korat.app_users WHERE active AND (role='CENTER_HEAD' OR id=l.mentor_id);
 INSERT INTO mentor_korat.notification_outbox(leave_id,kind) VALUES(lid,kind);
END $$;
REVOKE ALL ON FUNCTION mentor_korat.notify_line_change(uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION mentor_korat.protect_retracted_leave() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.line_retracted AND NEW.line_retracted AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'LINE_MESSAGE_RETRACTED'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mentor_korat.protect_retracted_leave() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_retracted_leave BEFORE UPDATE OF status ON mentor_korat.leave_requests FOR EACH ROW EXECUTE FUNCTION mentor_korat.protect_retracted_leave();

CREATE OR REPLACE FUNCTION mentor_korat.ingest_leave(event_id text,parsed jsonb,hash text,token_nonce text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e mentor_korat.integration_events; emp mentor_korat.employees; l mentor_korat.leave_requests; origin mentor_korat.leave_raw_messages; lid uuid; issues jsonb; mid text; gid text; uid text; sent_at bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(680318415);
 SELECT * INTO e FROM mentor_korat.integration_events WHERE id=event_id FOR UPDATE;
 IF NOT FOUND OR e.status='DONE' THEN RETURN; END IF;
 mid:=e.payload->'message'->>'id';gid:=e.payload->'source'->>'groupId';uid:=e.payload->'source'->>'userId';
 sent_at:=CASE WHEN e.payload->>'timestamp' ~ '^[0-9]{1,16}$' THEN (e.payload->>'timestamp')::bigint END;
 IF EXISTS(SELECT 1 FROM mentor_korat.line_unsent_messages WHERE group_id=gid AND message_id=mid) THEN
  UPDATE mentor_korat.integration_events SET status='DONE',locked_until=NULL,error_code=NULL,payload=jsonb_set(payload,'{message,text}','"[unsent message removed]"') WHERE id=event_id;
  RETURN;
 END IF;
 SELECT * INTO emp FROM mentor_korat.employees WHERE code=parsed->>'employee_code' AND active;
 issues:=coalesce(parsed->'issues','[]');
 IF emp.id IS NULL THEN issues:=issues||'"UNKNOWN_EMPLOYEE"'::jsonb;
 ELSIF regexp_replace(emp.name,'\s','','g')<>regexp_replace(parsed->>'employee_name','\s','','g') THEN issues:=issues||'"NAME_MISMATCH"'::jsonb; END IF;
 SELECT * INTO l FROM mentor_korat.leave_requests WHERE document_number=parsed->>'document_number' FOR UPDATE;
 IF l.id IS NOT NULL THEN
  SELECT * INTO origin FROM mentor_korat.leave_raw_messages WHERE leave_id=l.id;
  IF jsonb_array_length(issues)=0 AND l.line_retracted AND l.employee_id=emp.id AND origin.retracted_at IS NOT NULL AND origin.group_id=gid AND uid IS NOT NULL AND uid<>'' AND uid=origin.line_user_id AND sent_at>origin.line_timestamp
   AND l.status='WAITING_EVIDENCE' AND NOT EXISTS(SELECT 1 FROM mentor_korat.evidence_files WHERE leave_id=l.id)
   AND NOT EXISTS(SELECT 1 FROM mentor_korat.evidence_upload_tokens WHERE leave_id=l.id AND state='USED')
   AND NOT EXISTS(SELECT 1 FROM mentor_korat.leave_status_history WHERE leave_id=l.id AND (to_status<>'WAITING_EVIDENCE' OR actor_id IS NOT NULL)) THEN
   UPDATE mentor_korat.leave_requests SET leave_type=parsed->>'leave_type',leave_date=(parsed->>'leave_date')::date,period=parsed->>'period',reason=parsed->>'reason',line_retracted=false,version=version+1 WHERE id=l.id;
   UPDATE mentor_korat.leave_raw_messages SET event_id=e.id,message=e.payload->'message'->>'text',line_message_id=mid,line_user_id=uid,line_timestamp=sent_at,retracted_at=NULL,received_at=now() WHERE leave_id=l.id;
   PERFORM mentor_korat.rotate_token(l.id,hash,token_nonce);
   UPDATE mentor_korat.leave_parsing_issues i SET resolved=true WHERE i.event_id=e.id;
   PERFORM mentor_korat.audit(NULL,l.id,'LINE_LEAVE_CORRECTED',NULL,jsonb_build_object('old_event_id',origin.event_id,'new_event_id',e.id));
   PERFORM mentor_korat.notify_line_change(l.id,'พนักงานแก้ไขข้อมูลใบลาหลังยกเลิกข้อความเดิม','LINE_CORRECTED');
   UPDATE mentor_korat.integration_events SET status='DONE',locked_until=NULL,error_code=NULL WHERE id=event_id;
   RETURN;
  END IF;
  issues:=issues||CASE WHEN l.line_retracted THEN '"LINE_CORRECTION_REVIEW_REQUIRED"'::jsonb ELSE '"DUPLICATE_DOCUMENT"'::jsonb END;
 END IF;
 IF jsonb_array_length(issues)>0 THEN
  INSERT INTO mentor_korat.leave_parsing_issues(event_id,issues,parsed) VALUES(event_id,issues,parsed);
  INSERT INTO mentor_korat.notifications(user_id,title) SELECT id,'ข้อความ LINE ต้องตรวจสอบเพิ่มเติม' FROM mentor_korat.app_users WHERE active AND (role='CENTER_HEAD' OR id=emp.mentor_id);
 ELSE
  INSERT INTO mentor_korat.leave_requests(document_number,employee_id,mentor_id,assignment_status,leave_type,leave_date,period,reason) VALUES(parsed->>'document_number',emp.id,emp.mentor_id,CASE WHEN emp.mentor_id IS NULL THEN 'UNASSIGNED' ELSE 'ASSIGNED' END,parsed->>'leave_type',(parsed->>'leave_date')::date,parsed->>'period',parsed->>'reason') RETURNING id INTO lid;
  INSERT INTO mentor_korat.leave_raw_messages(leave_id,event_id,group_id,message,line_message_id,line_user_id,line_timestamp) VALUES(lid,event_id,gid,e.payload->'message'->>'text',mid,uid,sent_at);
  PERFORM mentor_korat.rotate_token(lid,hash,token_nonce);
  INSERT INTO mentor_korat.leave_status_history(leave_id,to_status) VALUES(lid,'WAITING_EVIDENCE');
  PERFORM mentor_korat.audit(NULL,lid,'LINE_LEAVE_CREATED');
  PERFORM mentor_korat.notify(lid,CASE WHEN emp.mentor_id IS NULL THEN 'มีใบลารอมอบหมาย Mentor' ELSE 'ได้รับใบลาใหม่' END);
 END IF;
 UPDATE mentor_korat.integration_events SET status='DONE',locked_until=NULL,error_code=NULL WHERE id=event_id;
END $$;

CREATE FUNCTION mentor_korat.process_line_unsend(event_id text,hash text,token_nonce text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e mentor_korat.integration_events; origin mentor_korat.leave_raw_messages; l mentor_korat.leave_requests; candidate record; mid text; gid text;
BEGIN
 PERFORM pg_advisory_xact_lock(680318415);
 SELECT * INTO e FROM mentor_korat.integration_events WHERE id=event_id FOR UPDATE;
 IF NOT FOUND OR e.status='DONE' THEN RETURN; END IF;
 mid:=e.payload->'unsend'->>'messageId';gid:=e.payload->'source'->>'groupId';
 IF e.payload->>'type'<>'unsend' OR coalesce(mid,'')='' OR coalesce(gid,'')='' THEN RAISE EXCEPTION 'INVALID_UNSEND_EVENT'; END IF;
 INSERT INTO mentor_korat.line_unsent_messages(group_id,message_id) VALUES(gid,mid) ON CONFLICT DO NOTHING;
 SELECT * INTO origin FROM mentor_korat.leave_raw_messages WHERE group_id=gid AND line_message_id=mid AND retracted_at IS NULL;
 IF origin.id IS NOT NULL THEN
  SELECT * INTO l FROM mentor_korat.leave_requests WHERE id=origin.leave_id FOR UPDATE;
  UPDATE mentor_korat.leave_raw_messages SET message='[unsent message removed]',retracted_at=now() WHERE id=origin.id;
  UPDATE mentor_korat.leave_requests SET line_retracted=true,version=version+1 WHERE id=l.id;
  UPDATE mentor_korat.evidence_upload_tokens SET state='REVOKED' WHERE leave_id=l.id AND state='ACTIVE';
  PERFORM mentor_korat.audit(NULL,l.id,'LINE_MESSAGE_UNSENT',NULL,jsonb_build_object('event_id',origin.event_id));
  PERFORM mentor_korat.notify_line_change(l.id,'พนักงานยกเลิกข้อความ LINE ต้นทาง กรุณารอข้อมูลแก้ไขหรือตรวจสอบกับหัวหน้า','LINE_UNSENT');
 END IF;
 UPDATE mentor_korat.leave_parsing_issues i SET parsed=NULL,resolved=true WHERE i.event_id IN(SELECT id FROM mentor_korat.integration_events WHERE payload->'source'->>'groupId'=gid AND payload->'message'->>'id'=mid);
 UPDATE mentor_korat.integration_events SET payload=jsonb_set(payload,'{message,text}','"[unsent message removed]"') WHERE payload->'source'->>'groupId'=gid AND payload->'message'->>'id'=mid;
 -- A correction may have reached us before the unsend webhook. Retry the latest
 -- matching duplicate using the same transactional replacement guards above.
 IF l.id IS NOT NULL AND hash IS NOT NULL AND token_nonce IS NOT NULL THEN
  SELECT i.event_id,i.parsed INTO candidate FROM mentor_korat.leave_parsing_issues i JOIN mentor_korat.integration_events n ON n.id=i.event_id
   WHERE NOT i.resolved AND (i.issues ? 'DUPLICATE_DOCUMENT') AND i.parsed->>'document_number'=l.document_number
   AND n.payload->'source'->>'groupId'=gid AND n.payload->'source'->>'userId'=origin.line_user_id
   AND NOT EXISTS(SELECT 1 FROM mentor_korat.line_unsent_messages u WHERE u.group_id=gid AND u.message_id=n.payload->'message'->>'id')
   ORDER BY n.created_at DESC LIMIT 1;
  IF FOUND THEN
   UPDATE mentor_korat.integration_events SET status='PENDING',locked_until=NULL WHERE id=candidate.event_id;
   PERFORM mentor_korat.ingest_leave(candidate.event_id,candidate.parsed,hash,token_nonce);
  END IF;
 END IF;
 UPDATE mentor_korat.integration_events SET status='DONE',locked_until=NULL,error_code=NULL WHERE id=event_id;
END $$;
REVOKE ALL ON FUNCTION mentor_korat.process_line_unsend(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mentor_korat.process_line_unsend(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION mentor_korat.correct_leave(lid uuid,payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l mentor_korat.leave_requests;
BEGIN
 SELECT * INTO l FROM mentor_korat.leave_requests WHERE id=lid FOR UPDATE;
 IF NOT mentor_korat.can_view(lid) OR NOT mentor_korat.has_permission('leaves.edit') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF payload->>'version' IS NULL OR l.version<>(payload->>'version')::int THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF l.status IN ('VERIFIED','REJECTED') OR length(trim(coalesce(payload->>'correction_reason','')))=0 THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
 IF l.line_retracted THEN
  IF NOT EXISTS(SELECT 1 FROM mentor_korat.app_users WHERE id=auth.uid() AND active AND role='CENTER_HEAD') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF l.status IN ('WAITING_EVIDENCE','REUPLOAD_REQUIRED') THEN
   IF payload->>'new_token_hash' IS NULL OR payload->>'new_token_nonce' IS NULL THEN RAISE EXCEPTION 'TOKEN_REQUIRED'; END IF;
   PERFORM mentor_korat.rotate_token(lid,payload->>'new_token_hash',payload->>'new_token_nonce');
  END IF;
 END IF;
 UPDATE mentor_korat.leave_requests SET leave_date=(payload->>'leave_date')::date,leave_type=payload->>'leave_type',period=payload->>'period',reason=payload->>'reason',version=version+1,line_retracted=false WHERE id=lid;
 PERFORM mentor_korat.audit(auth.uid(),lid,'LEAVE_CORRECT',to_jsonb(l),payload-ARRAY['new_token_hash','new_token_nonce']);
 IF l.line_retracted THEN
  UPDATE mentor_korat.leave_parsing_issues SET resolved=true WHERE NOT resolved AND parsed->>'document_number'=l.document_number AND issues ? 'LINE_CORRECTION_REVIEW_REQUIRED';
  PERFORM mentor_korat.notify_line_change(lid,'หัวหน้าตรวจสอบและแก้ไขข้อมูลใบลาที่ถูกยกเลิกข้อความแล้ว','LINE_CORRECTED');
 END IF;
END $$;
