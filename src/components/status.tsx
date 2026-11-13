import { statusLabels, type Status } from "@/lib/domain";
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge status-${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
