export default function Loading() {
  return (
    <div aria-label="กำลังโหลดข้อมูล" className="skeleton-page">
      <div className="skeleton title" />
      <div className="stat-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton card" key={i} />
        ))}
      </div>
      <div className="skeleton table" />
    </div>
  );
}
