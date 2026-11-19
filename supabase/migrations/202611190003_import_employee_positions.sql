-- Preserve the original import RPC for older clients. This RPC uses each CSV position as a department.
CREATE FUNCTION mentor_korat.import_employees_csv(employees jsonb, fallback_department_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; eid uuid; did uuid; department_name text; added integer:=0; skipped integer:=0; created integer:=0;
BEGIN
 IF NOT mentor_korat.has_permission('employees.manage') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF jsonb_typeof(employees) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_EMPLOYEES'; END IF;
 IF jsonb_array_length(employees) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'INVALID_EMPLOYEES'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(employees) LOOP
   IF jsonb_typeof(item->'code') IS DISTINCT FROM 'string'
      OR (item->>'code') !~ '^[A-Z0-9]{3,12}$'
      OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
      OR length(trim(item->>'name')) NOT BETWEEN 2 AND 160
      OR jsonb_typeof(item->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_EMPLOYEE'; END IF;
   department_name:=NULL;
   IF item ? 'department_name' THEN
     IF jsonb_typeof(item->'department_name') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_DEPARTMENT'; END IF;
     department_name:=trim(item->>'department_name');
     IF length(department_name) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'INVALID_DEPARTMENT'; END IF;
   ELSIF NOT EXISTS(SELECT 1 FROM mentor_korat.departments d WHERE d.id=fallback_department_id) THEN
     RAISE EXCEPTION 'INVALID_DEPARTMENT';
   END IF;
   IF EXISTS(SELECT 1 FROM mentor_korat.employees e WHERE e.code=item->>'code') THEN
     skipped:=skipped+1;
     CONTINUE;
   END IF;
   did:=fallback_department_id;
   IF department_name IS NOT NULL THEN
     did:=NULL;
     INSERT INTO mentor_korat.departments(name) VALUES(department_name)
       ON CONFLICT(name) DO NOTHING RETURNING id INTO did;
     IF did IS NULL THEN
       SELECT d.id INTO did FROM mentor_korat.departments d WHERE d.name=department_name;
     ELSE
       created:=created+1;
       PERFORM mentor_korat.audit(auth.uid(),did,'MANAGE_department',NULL,jsonb_build_object('name',department_name,'source','csv'));
     END IF;
   END IF;
   eid:=NULL;
   INSERT INTO mentor_korat.employees(code,name,department_id,active)
     VALUES(item->>'code',trim(item->>'name'),did,(item->>'active')::boolean)
     ON CONFLICT(code) DO NOTHING RETURNING id INTO eid;
   IF eid IS NULL THEN skipped:=skipped+1;
   ELSE
     added:=added+1;
     PERFORM mentor_korat.audit(auth.uid(),eid,'MANAGE_employee',NULL,item||jsonb_build_object('department_id',did,'source','csv'));
   END IF;
 END LOOP;
 RETURN jsonb_build_object('added',added,'skipped',skipped,'departments_created',created);
END $$;
REVOKE ALL ON FUNCTION mentor_korat.import_employees_csv(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.import_employees_csv(jsonb,uuid) TO authenticated;
