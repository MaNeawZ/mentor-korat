import { expect, it } from "vitest";
import { buildOrgChart, type OrgData } from "../src/lib/org-chart";
const data: OrgData = {
  scoped: false,
  people: [
    { id: "head", name: "Head", role: "CENTER_HEAD", active: true },
    { id: "hr", name: "HR", role: "HR", active: true },
    { id: "one", name: "Mentor One", role: "MENTOR", active: true },
    { id: "two", name: "Former Mentor", role: "MENTOR", active: false },
  ],
  employees: [
    {
      id: "a",
      code: "001",
      name: "Alice",
      department: "HR",
      mentor_id: "one",
      active: true,
    },
    {
      id: "b",
      code: "002",
      name: "Bob",
      department: "Engineer",
      mentor_id: "two",
      active: true,
    },
    {
      id: "c",
      code: "003",
      name: "Carol",
      department: "Design",
      mentor_id: null,
      active: true,
    },
    {
      id: "d",
      code: "004",
      name: "David",
      department: "HR",
      mentor_id: "one",
      active: false,
    },
    {
      id: "e",
      code: "005",
      name: "Eve",
      department: "Design",
      mentor_id: "missing",
      active: true,
    },
  ],
};
it("keeps leadership above mentors, groups each employee once, and flags missing or inactive mentors", () => {
  const chart = buildOrgChart(data);
  expect(chart.leaders.map((person) => person.id)).toEqual(["head", "hr"]);
  expect(
    chart.teams.map((team) => team.employees.map((employee) => employee.id)),
  ).toEqual([["a"], ["b"]]);
  expect(chart.unassigned.map((employee) => employee.id)).toEqual(["c", "e"]);
  expect(chart.employeeCount).toBe(4);
});
it("searches employees by name, code and department, preserving the Mentor branch", () => {
  expect(buildOrgChart(data, " ALICE ").teams[0].mentor.id).toBe("one");
  expect(buildOrgChart(data, "002").teams[0].mentor.id).toBe("two");
  expect(buildOrgChart(data, "design").unassigned).toHaveLength(2);
  expect(buildOrgChart(data, "Mentor One").teams[0].employees).toHaveLength(1);
  expect(buildOrgChart(data, "not found").employeeCount).toBe(0);
});
it("includes disabled employees only when requested", () => {
  expect(buildOrgChart(data, "", true).employeeCount).toBe(5);
  expect(buildOrgChart(data, "David", false).teams).toEqual([]);
  expect(buildOrgChart(data, "David", true).teams[0].mentor.id).toBe("one");
});
