import { EmployeePage } from "@/components/employee-page";
import type { Filters } from "@/lib/repository";
export default async function Unassigned({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  return <EmployeePage unassigned filters={await searchParams} />;
}
