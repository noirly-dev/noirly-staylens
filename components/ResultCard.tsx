"use client";

import type { ScoredProperty } from "@/lib/scoring/score";
import { formatDuration, formatMoney } from "@/lib/format";
import { MatchRing } from "./MatchRing";
import { PhotoThumb } from "./PhotoThumb";

interface Props {
  result: ScoredProperty;
  rank: number;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

export function ResultCard({ result, rank, selected, highlighted, onSelect, onHover }: Props) {
  const p = result.property;
  return (
    <li data-id={p.id}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        className={`flex w-full gap-3 rounded-xl border p-2.5 text-left transition ${
          selected ? "border-accent bg-accent/10" : highlighted ? "border-accent/60 bg-surface-2" : "border-border bg-surface hover:bg-surface-2"
        }`}
      >
        <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-36">
          <PhotoThumb property={p} className="h-full w-full" />
          <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 text-[11px] font-semibold text-white">#{rank}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-text">{p.name}</h3>
              <p className="text-xs text-muted">
                {p.rating !== undefined && <span className="text-text">★ {p.rating.toFixed(1)}</span>}
                {p.reviewCount !== undefined && <span> ({p.reviewCount.toLocaleString("en-IN")})</span>}
                {p.driveTimeMin !== undefined && <span> · {formatDuration(p.driveTimeMin)} drive</span>}
                {p.driveTimeMin === undefined && p.distanceKm !== undefined && <span> · {p.distanceKm} km</span>}
              </p>
            </div>
            <MatchRing score={result.matchScore} />
          </div>
          <p className="text-sm">
            {p.nightlyRate !== undefined ? (
              <>
                <span className="font-semibold text-text">{formatMoney(p.nightlyRate, p.currency)}</span>
                <span className="text-xs text-muted"> / night</span>
              </>
            ) : (
              <span className="text-xs text-muted">Price unavailable</span>
            )}
          </p>
          <FilterChips result={result} />
        </div>
      </button>
    </li>
  );
}

export function FilterChips({ result, limit = 6 }: { result: ScoredProperty; limit?: number }) {
  const chips = result.breakdown
    .filter((b) => !b.hard)
    .sort((a, b) => Number(b.passed) - Number(a.passed))
    .slice(0, limit);
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {chips.map((b) => (
        <li
          key={b.filterId}
          className={`rounded-full px-2 py-0.5 text-[10px] ${
            b.passed ? "bg-good/15 text-good" : b.status === "unknown" ? "bg-surface-3 text-muted" : "bg-bad/10 text-bad/90 line-through decoration-bad/40"
          }`}
          title={b.status === "unknown" ? "No data" : b.passed ? "Matched" : "Not matched"}
        >
          {b.passed ? "✓ " : b.status === "unknown" ? "? " : ""}
          {b.label}
        </li>
      ))}
    </ul>
  );
}
