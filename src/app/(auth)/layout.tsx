import { Sprout, CalendarDays, Check, Users } from "lucide-react";
export const dynamic = "force-dynamic";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="portal">
      <div className="portal-haze" aria-hidden="true" />
      <header className="portal-brand">
        <span>
          <Sprout size={24} />
        </span>
        KORAT
        <span className="portal-brand-dot" />
      </header>
      <section className="portal-art" aria-hidden="true">
        <div className="portal-grid" />
        <div className="portal-scene">
          <div className="portal-aura" />
          <div className="portal-orbit portal-orbit-one" />
          <div className="portal-orbit portal-orbit-two" />
          <div className="portal-orbit portal-orbit-three" />
          <div className="portal-core">
            <Sprout strokeWidth={1.1} />
          </div>
          <div className="portal-satellite portal-satellite-one">
            <CalendarDays strokeWidth={1.5} />
            <span />
            <span />
          </div>
          <div className="portal-satellite portal-satellite-two">
            <Users strokeWidth={1.5} />
            <i />
            <i />
            <i />
          </div>
          <div className="portal-satellite portal-satellite-three">
            <Check strokeWidth={2} />
          </div>
          <div className="portal-particle portal-particle-one" />
          <div className="portal-particle portal-particle-two" />
          <div className="portal-particle portal-particle-three" />
        </div>
        <div className="portal-art-caption">
          <span />
          CONNECTED. TOGETHER.
        </div>
      </section>
      <section className="portal-form-side">
        <div className="auth-form-card portal-card">
          <div className="portal-card-symbol" aria-hidden="true">
            <Sprout size={25} strokeWidth={1.5} />
          </div>
          {children}
        </div>
      </section>
      <footer className="portal-footer">
        <span>LEAVE MONITORING</span>
        <span>
          KORAT WORKSPACE <i />
        </span>
      </footer>
    </main>
  );
}
