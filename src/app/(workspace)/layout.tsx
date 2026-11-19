import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function Workspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "Asia/Bangkok",
  }).format(now);
  const year = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(now);
  return (
    <Shell user={user} dateLabel={dateLabel} year={year}>
      {children}
    </Shell>
  );
}
