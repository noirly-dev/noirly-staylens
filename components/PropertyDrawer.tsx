"use client";

import { useEffect } from "react";
import type { ScoredProperty } from "@/lib/scoring/score";
import { formatDuration, formatMoney } from "@/lib/format";
import { MatchRing } from "./MatchRing";
import { PhotoThumb } from "./PhotoThumb";

export function PropertyDrawer({ result, onClose }: { result: ScoredProperty | null; onClose: () => void }) {
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, onClose]);

  if (!result) return null;
  const p = result.property;
  const google = p.sourceRefs.google;
  const rateRef = Object.entries(p.sourceRefs).find(([k, v]) => k !== "google" && k !== "mock" && v.confidence !== undefined);
  const soft = result.breakdown.filter((b) => !b.hard);
  const hard = result.breakdown.filter((b) => b.hard);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={p.name}>
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="scrollbar-thin relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl">
        <div className="relative">
          {p.photos.length > 1 ? (
            <div className="scrollbar-thin flex snap-x snap-mandatory overflow-x-auto">
              {p.photos.map((ph, i) => (
                <figure key={ph.url} className="relative w-full shrink-0 snap-center">
                  <PhotoThumb property={p} index={i} className="h-56 w-full" />
                  {ph.attribution && (
                    <figcaption className="absolute bottom-1 right-2 text-[10px] text-white/80">
                      Photo:{" "}
                      {ph.attribution.uri ? (
                        <a href={ph.attribution.uri} target="_blank" rel="noreferrer" className="underline">
                          {ph.attribution.name}
                        </a>
                      ) : (
                        ph.attribution.name
                      )}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          ) : (
            <PhotoThumb property={p} className="h-56 w-full" />
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-sm text-white hover:bg-black/80"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{p.name}</h2>
              {p.address && <p className="text-xs text-muted">{p.address}</p>}
              <p className="mt-1 text-sm text-muted">
                {p.rating !== undefined && <span className="text-text">★ {p.rating.toFixed(1)}</span>}
                {p.reviewCount !== undefined && <span> · {p.reviewCount.toLocaleString("en-IN")} reviews</span>}
              </p>
            </div>
            <MatchRing score={result.matchScore} size={56} />
          </header>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Per night" value={p.nightlyRate !== undefined ? formatMoney(p.nightlyRate, p.currency) : "—"} />
            <Stat label="Drive" value={p.driveTimeMin !== undefined ? formatDuration(p.driveTimeMin) : "—"} />
            <Stat label="Distance" value={p.distanceKm !== undefined ? `${p.distanceKm} km` : "—"} />
          </dl>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Why it matches</h3>
            {soft.length === 0 && <p className="text-sm text-muted">No preferences set — pick some filters to rank stays.</p>}
            <ul className="flex flex-col gap-2">
              {soft.map((b) => (
                <li key={b.filterId}>
                  <div className="flex justify-between text-xs">
                    <span className={b.passed ? "text-text" : "text-muted"}>
                      {b.passed ? "✓" : b.status === "unknown" ? "?" : "✗"} {b.label}
                    </span>
                    <span className="tabular-nums text-muted">
                      {b.contribution} / {b.maxContribution}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full ${b.passed ? "bg-good" : "bg-warn"}`}
                      style={{ width: `${b.maxContribution ? (b.contribution / b.maxContribution) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {hard.length > 0 && (
              <p className="mt-3 text-xs text-muted">Must-haves met: {hard.map((b) => b.label).join(", ")}</p>
            )}
          </section>

          {(p.amenities.length > 0 || p.tags.length > 0) && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Amenities & vibe</h3>
              <ul className="flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <li key={`t-${t}`} className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                    ✦ {t.replace(/_/g, " ")}
                  </li>
                ))}
                {p.amenities.map((a) => (
                  <li key={`a-${a}`} className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted">
                    {a.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-col gap-2">
            {p.bookingUrl && (
              <a
                href={p.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-accent-contrast hover:bg-accent-strong"
              >
                View on provider ↗
              </a>
            )}
            {google?.url && (
              <a href={google.url} target="_blank" rel="noopener noreferrer" className="text-center text-xs text-muted hover:text-text">
                Open in Google Maps ↗
              </a>
            )}
            {rateRef && (
              <p className="text-center text-[11px] text-muted">
                Rate from {rateRef[0]} · match confidence {Math.round((rateRef[1].confidence ?? 0) * 100)}%
              </p>
            )}
            {google && <p className="text-center text-[10px] text-muted">Place data © Google</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2">
      <dt className="text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
