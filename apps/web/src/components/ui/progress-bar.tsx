interface ProgressBarProps {
  value: number;
  label: string;
  showValue?: boolean;
}

export function ProgressBar({ value, label, showValue = false }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div>
      {showValue && (
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-[var(--text-soft)]">
          <span>{label}</span>
          <span>{Math.round(safeValue)}%</span>
        </div>
      )}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(safeValue)}
      >
        <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
