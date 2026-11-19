-- Preserve leave history. A selected batch either deletes completely or fails.
CREATE FUNCTION mentor_korat.delete_employees(employee_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee mentor_korat.employees; ids uuid[]; expected integer; locked integer:=0; blocked_codes text;
BEGIN
 IF NOT mentor_korat.has_permission('employees.manage') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF coalesce(cardinality(employee_ids),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_EMPLOYEES'; END IF;
 IF array_position(employee_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'INVALID_EMPLOYEES'; END IF;
 SELECT array_agg(DISTINCT id) INTO ids FROM unnest(employee_ids) AS id;
 expected:=cardinality(ids);
 -- Stable ordering avoids deadlocks between overlapping batches. FOR UPDATE also
 -- serializes FK checks from concurrent leave creation with the deletion.
 FOR employee IN SELECT e.* FROM mentor_korat.employees e WHERE e.id=ANY(ids) ORDER BY e.id FOR UPDATE LOOP
   locked:=locked+1;
 END LOOP;
 IF locked<>expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 SELECT string_agg(e.code,', ' ORDER BY e.code) INTO blocked_codes FROM mentor_korat.employees e
   WHERE e.id=ANY(ids) AND EXISTS(SELECT 1 FROM mentor_korat.leave_requests l WHERE l.employee_id=e.id);
 IF blocked_codes IS NOT NULL THEN RAISE EXCEPTION 'EMPLOYEE_HAS_LEAVES:%',blocked_codes; END IF;
 FOR employee IN SELECT e.* FROM mentor_korat.employees e WHERE e.id=ANY(ids) ORDER BY e.id LOOP
   DELETE FROM mentor_korat.employees e WHERE e.id=employee.id;
   PERFORM mentor_korat.audit(auth.uid(),employee.id,'DELETE_employee',to_jsonb(employee),NULL);
 END LOOP;
 RETURN jsonb_build_object('deleted',expected);
END $$;
REVOKE ALL ON FUNCTION mentor_korat.delete_employees(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.delete_employees(uuid[]) TO authenticated;
