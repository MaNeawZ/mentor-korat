-- Return only the fields needed for the chart; mentors see their own branch.
CREATE FUNCTION mentor_korat.org_chart() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE full_view boolean; scoped_view boolean;
BEGIN
 full_view:=mentor_korat.has_permission('employees.manage') OR mentor_korat.has_permission('mentors.assign') OR mentor_korat.has_permission('leaves.view_all');
 scoped_view:=mentor_korat.has_permission('leaves.view_assigned');
 IF NOT full_view AND NOT scoped_view THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN jsonb_build_object(
   'scoped',NOT full_view,
   'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'role',u.role,'active',u.active) ORDER BY u.name,u.id),'[]'::jsonb)
     FROM mentor_korat.app_users u WHERE u.role IN ('CENTER_HEAD','HR') OR (u.role='MENTOR' AND (full_view OR u.id=auth.uid()))),
   'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'code',e.code,'name',e.name,'department',d.name,'mentor_id',e.mentor_id,'active',e.active) ORDER BY e.code,e.id),'[]'::jsonb)
     FROM mentor_korat.employees e JOIN mentor_korat.departments d ON d.id=e.department_id WHERE full_view OR e.mentor_id=auth.uid())
 );
END $$;
REVOKE ALL ON FUNCTION mentor_korat.org_chart() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mentor_korat.org_chart() TO authenticated;
