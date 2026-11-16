ALTER TABLE mentor_korat.employees DROP CONSTRAINT employee_code_format,
 ADD CONSTRAINT employee_code_format CHECK(code ~ '^[A-Z0-9]{3,12}$');
