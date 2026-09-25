export function MatchRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--good)" : score >= 50 ? "var(--accent)" : "var(--warn)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${score}% match`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">{score}%</span>
    </div>
  );
}
