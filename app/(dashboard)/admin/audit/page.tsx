export default function AuditPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--foreground)] tracking-tight">
          Audit Log
        </h1>
        <p className="text-base text-[var(--sidebar-text-secondary)] mt-1">
          View system audit logs and activity history
        </p>
      </div>
      <div className="mt-8 p-8 rounded-xl border border-[var(--sidebar-border)] bg-[var(--nav-hover)] flex items-center justify-center min-h-80">
        <p className="text-[var(--sidebar-text-secondary)]">
          Coming soon. View system audit logs and activity history here.
        </p>
      </div>
    </div>
  );
}
