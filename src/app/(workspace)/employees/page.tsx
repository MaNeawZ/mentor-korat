import { EmployeePage } from "@/components/employee-page";
import type { Filters } from "@/lib/repository";
export default async function Employees({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  return <EmployeePage filters={await searchParams} />;
}
