export function ProgressRing({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-ring" title={`${label}: ${clamped}%`}>
      <svg viewBox="0 0 120 120" aria-label={`${label} ${clamped}%`}>
        <circle cx="60" cy="60" r="49" className="ring-bg" />
        <circle
          cx="60"
          cy="60"
          r="49"
          className="ring-fg"
          strokeDasharray={`${clamped * 3.078} 308`}
        />
      </svg>
      <div className="ring-label">
        <strong>{clamped}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
