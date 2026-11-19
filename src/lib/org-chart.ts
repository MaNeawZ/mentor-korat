import type { Permission, Role } from "./domain";

export const orgChartPermissions: Permission[] = [
  "employees.manage",
  "mentors.assign",
  "leaves.view_all",
  "leaves.view_assigned",
];
export type OrgPerson = {
  id: string;
  name: string;
  role: Role;
  active: boolean;
};
export type OrgEmployee = {
  id: string;
  code: string;
  name: string;
  department: string;
  mentor_id: string | null;
  active: boolean;
};
export type OrgData = {
  people: OrgPerson[];
  employees: OrgEmployee[];
  scoped: boolean;
};

export function buildOrgChart(
  data: OrgData,
  query = "",
  includeInactive = false,
) {
  const term = query.trim().toLocaleLowerCase("th-TH");
  const matches = (...values: string[]) =>
    values.some((value) => value.toLocaleLowerCase("th-TH").includes(term));
  const employees = data.employees.filter(
    (employee) => includeInactive || employee.active,
  );
  const mentors = data.people.filter((person) => person.role === "MENTOR");
  const mentorIds = new Set(mentors.map((mentor) => mentor.id));
  const employeeMatches = (employee: OrgEmployee) =>
    matches(employee.name, employee.code, employee.department);
  const teams = mentors
    .map((mentor) => {
      const members = employees.filter(
        (employee) => employee.mentor_id === mentor.id,
      );
      return {
        mentor,
        total: members.length,
        employees: matches(mentor.name)
          ? members
          : members.filter(employeeMatches),
      };
    })
    .filter(
      (team) =>
        (includeInactive || team.mentor.active || team.total > 0) &&
        (!term || matches(team.mentor.name) || team.employees.length > 0),
    );
  const unassigned = employees.filter(
    (employee) =>
      (!employee.mentor_id || !mentorIds.has(employee.mentor_id)) &&
      employeeMatches(employee),
  );
  return {
    leaders: data.people.filter(
      (person) =>
        person.role !== "MENTOR" && (includeInactive || person.active),
    ),
    teams,
    unassigned,
    employeeCount:
      teams.reduce((count, team) => count + team.employees.length, 0) +
      unassigned.length,
  };
}
