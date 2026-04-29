export default function BriefingPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--foreground)] tracking-tight">
          Daily Briefing
        </h1>
        <p className="text-base text-[var(--sidebar-text-secondary)] mt-1">
          Your personalized daily digest
        </p>
      </div>
      <div className="mt-8 p-8 rounded-xl border border-[var(--sidebar-border)] bg-[var(--nav-hover)] flex items-center justify-center min-h-80">
        <p className="text-[var(--sidebar-text-secondary)]">
          Coming soon. Personalized briefings will appear here.
        </p>
      </div>
    </div>
  );
}
