-- One transaction: new employees only; existing details and assignments are preserved.
CREATE FUNCTION mentor_korat.import_employees(department_id uuid, employees jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; eid uuid; added integer:=0; skipped integer:=0;
BEGIN
 IF NOT mentor_korat.has_permission('employees.manage') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF jsonb_typeof(employees) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_EMPLOYEES'; END IF;
 IF jsonb_array_length(employees) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'INVALID_EMPLOYEES'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mentor_korat.departments d WHERE d.id=department_id) THEN RAISE EXCEPTION 'INVALID_DEPARTMENT'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(employees) LOOP
   IF jsonb_typeof(item->'code') IS DISTINCT FROM 'string'
      OR (item->>'code') !~ '^[A-Z0-9]{3,12}$'
      OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
      OR length(trim(item->>'name')) NOT BETWEEN 2 AND 160
      OR jsonb_typeof(item->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_EMPLOYEE'; END IF;
   eid:=NULL;
   INSERT INTO mentor_korat.employees(code,name,department_id,active)
     VALUES(item->>'code',trim(item->>'name'),department_id,(item->>'active')::boolean)
     ON CONFLICT(code) DO NOTHING RETURNING id INTO eid;
   IF eid IS NULL THEN skipped:=skipped+1;
   ELSE
     added:=added+1;
     PERFORM mentor_korat.audit(auth.uid(),eid,'MANAGE_employee',NULL,item||jsonb_build_object('department_id',department_id,'source','csv'));
   END IF;
 END LOOP;
 RETURN jsonb_build_object('added',added,'skipped',skipped);
END $$;
REVOKE ALL ON FUNCTION mentor_korat.import_employees(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.import_employees(uuid,jsonb) TO authenticated;
