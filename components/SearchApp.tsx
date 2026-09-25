"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterConfig, FilterValue, FilterValues } from "@/lib/config/schema";
import { describeFilterValue } from "@/lib/format";
import type { SearchResponse } from "@/lib/search/pipeline";
import type { GeoPoint } from "@/lib/types";
import { FallbackMap } from "./FallbackMap";
import { FilterPanel } from "./FilterPanel";
import { GoogleResultsMap } from "./GoogleResultsMap";
import { PropertyDrawer } from "./PropertyDrawer";
import { ResultCard } from "./ResultCard";

interface Props {
  config: FilterConfig;
  defaults: FilterValues;
  initialDates: { checkIn: string; checkOut: string };
  mapsKey?: string;
  mapId?: string;
}

const DEFAULT_ORIGIN: GeoPoint = { lat: 12.9716, lng: 77.5946, label: "Bengaluru, Karnataka" };
const EXAMPLES = ["pool villa under 8k, 3hr from Bangalore, quiet", "pet friendly homestay near Mumbai within 4 hours", "workation ready stay with a view under 6k from Pune"];

interface ParseResponse {
  filters: FilterValues;
  originText: string | null;
  origin: GeoPoint | null;
}

const STAGE_LABELS: Record<string, string> = {
  candidates: "found",
  drive_time: "within drive",
  attributes: "attributes",
  enrichment: "vibe",
  shortlist: "priced",
  price: "in budget",
};

export function SearchApp({ config, defaults, initialDates, mapsKey, mapId }: Props) {
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<FilterValues>(defaults);
  const [origin, setOrigin] = useState<GeoPoint>(DEFAULT_ORIGIN);
  const [originText, setOriginText] = useState(DEFAULT_ORIGIN.label ?? "");
  const [dates, setDates] = useState(initialDates);
  const [guests, setGuests] = useState(2);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("staylens-theme", next);
    } catch {
      /* storage unavailable */
    }
  };

  const search = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, checkIn: dates.checkIn, checkOut: dates.checkOut, guests, filters: values }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Search failed (${res.status})`);
      setData(json as SearchResponse);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [origin, dates, guests, values]);

  // Re-run the search (debounced) whenever inputs change.
  useEffect(() => {
    if (dates.checkOut <= dates.checkIn) return;
    const t = setTimeout(search, 350);
    return () => clearTimeout(t);
  }, [search, dates]);

  const setFilter = useCallback((id: string, value: FilterValue) => setValues((v) => ({ ...v, [id]: value })), []);

  const geocode = async (text: string): Promise<GeoPoint | null> => {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
    return res.ok ? ((await res.json()) as GeoPoint) : null;
  };

  const commitOrigin = async () => {
    const text = originText.trim();
    if (!text || text === origin.label) return;
    const point = await geocode(text);
    if (point) {
      setOrigin(point);
      setOriginText(point.label ?? text);
      setNotice(null);
    } else {
      setNotice(`Couldn't find "${text}".`);
    }
  };

  const submitQuery = async (text = query) => {
    if (!text.trim()) return;
    setParsing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not understand that");
      const parsed = json as ParseResponse;
      setValues({ ...defaults, ...parsed.filters });
      if (parsed.origin) {
        setOrigin(parsed.origin);
        setOriginText(parsed.origin.label ?? parsed.originText ?? "");
      } else if (parsed.originText) {
        setNotice(`Couldn't locate "${parsed.originText}" — keeping ${origin.label ?? "current origin"}.`);
      }
      if (!Object.keys(parsed.filters).length) setNotice("No filters recognised — try mentioning budget, drive time or amenities.");
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const activeSummary = useMemo(
    () =>
      config.filters
        .filter((f) => JSON.stringify(values[f.id]) !== JSON.stringify(f.default))
        .map((f) => ({ id: f.id, text: describeFilterValue(f, values[f.id] ?? null, config.currency) })),
    [config, values],
  );

  const results = useMemo(() => data?.results ?? [], [data]);
  const drawerResult = results.find((r) => r.property.id === drawerId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    setDrawerId(id);
  };

  const selectFromMap = (id: string) => {
    setSelectedId(id);
    listRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setDrawerId(id);
  };

  const mapProps = { origin, results, selectedId, hoveredId, onSelect: selectFromMap, onHover: setHoveredId };
  const googleData = data?.meta.googleAttribution ?? false;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight">
              stay<span className="text-accent">lens</span>
            </span>
            <span className="hidden text-xs text-muted sm:inline">requirements first, destination second</span>
          </div>
          <button type="button" onClick={toggleTheme} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text" aria-label="Toggle theme">
            {theme === "dark" ? "☾ Dark" : "☀ Light"}
          </button>
        </div>
      </header>

      <div className="border-b border-border bg-surface/60">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void submitQuery();
            }}
          >
            <label htmlFor="nl-query" className="sr-only">
              Describe your stay
            </label>
            <input
              id="nl-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Describe your stay — e.g. "pool villa under 8k, 3hr from Bangalore, quiet"'
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="submit"
              disabled={parsing || !query.trim()}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-contrast hover:bg-accent-strong disabled:opacity-50"
            >
              {parsing ? "Understanding…" : "Find stays"}
            </button>
          </form>
          <div className="hidden flex-wrap items-center gap-2 text-xs sm:flex">
            {!query &&
              EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuery(ex);
                    void submitQuery(ex);
                  }}
                  className="rounded-full border border-border px-3 py-1 text-muted hover:text-text"
                >
                  {ex}
                </button>
              ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <Field label="From" className="col-span-2 sm:w-64">
              <input
                value={originText}
                onChange={(e) => setOriginText(e.target.value)}
                onBlur={() => void commitOrigin()}
                onKeyDown={(e) => e.key === "Enter" && void commitOrigin()}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Check-in">
              <input
                type="date"
                value={dates.checkIn}
                onChange={(e) => setDates((d) => ({ ...d, checkIn: e.target.value }))}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Check-out">
              <input
                type="date"
                value={dates.checkOut}
                min={dates.checkIn}
                onChange={(e) => setDates((d) => ({ ...d, checkOut: e.target.value }))}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Guests">
              <input
                type="number"
                min={1}
                max={20}
                value={guests}
                onChange={(e) => setGuests(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent sm:w-20"
              />
            </Field>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text lg:hidden"
            >
              Filters{activeSummary.length ? ` (${activeSummary.length})` : ""}
            </button>
          </div>
          {activeSummary.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Active filters">
              {activeSummary.map((a) => (
                <li key={a.id} className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] text-accent">
                  {a.text}
                </li>
              ))}
            </ul>
          )}
          {notice && <p className="text-xs text-warn">{notice}</p>}
          {dates.checkOut <= dates.checkIn && <p className="text-xs text-bad">Check-out must be after check-in.</p>}
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)]">
        <aside className="scrollbar-thin hidden overflow-y-auto border-r border-border p-4 lg:block">
          <FilterPanel config={config} values={values} onChange={setFilter} onReset={() => setValues(defaults)} />
        </aside>

        <div className="flex border-b border-border lg:hidden" role="tablist">
          {(["list", "map"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={mobileView === v}
              onClick={() => setMobileView(v)}
              className={`flex-1 py-2 text-sm capitalize ${mobileView === v ? "border-b-2 border-accent text-text" : "text-muted"}`}
            >
              {v}
            </button>
          ))}
        </div>

        <section className={`scrollbar-thin flex-col gap-3 p-4 lg:flex lg:overflow-y-auto ${mobileView === "list" ? "flex" : "hidden"}`} aria-busy={loading}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {loading && !data ? "Searching…" : `${results.length} stay${results.length === 1 ? "" : "s"} match`}
              {loading && data && <span className="ml-2 text-xs font-normal text-muted">updating…</span>}
            </h2>
            {data && (
              <p className="text-[11px] text-muted">
                {data.meta.stages.map((s, i) => (
                  <span key={s.stage}>
                    {i > 0 && " → "}
                    {s.count} {STAGE_LABELS[s.stage] ?? s.stage}
                  </span>
                ))}
              </p>
            )}
          </div>
          {error && <p className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
          {data && !results.length && !loading && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              No stays match every must-have. Try widening your budget or drive time.
              {Object.keys(data.meta.exclusions).length > 0 && (
                <p className="mt-2 text-xs">
                  Excluded by:{" "}
                  {Object.entries(data.meta.exclusions)
                    .map(([id, n]) => `${config.filters.find((f) => f.id === id)?.label ?? id} (${n})`)
                    .join(", ")}
                </p>
              )}
            </div>
          )}
          <ul ref={listRef} className="flex flex-col gap-2">
            {results.map((r, i) => (
              <ResultCard
                key={r.property.id}
                result={r}
                rank={i + 1}
                selected={selectedId === r.property.id}
                highlighted={hoveredId === r.property.id}
                onSelect={() => select(r.property.id)}
                onHover={(h) => setHoveredId(h ? r.property.id : null)}
              />
            ))}
          </ul>
          {data && (
            <p className="pt-2 text-[10px] text-muted">
              Data: places {data.meta.providers.places} · routes {data.meta.providers.routes} · rates {data.meta.providers.rates} · tags{" "}
              {data.meta.providers.enrichment} · rates checked for {data.meta.ratesFetched} stays
            </p>
          )}
        </section>

        <section className={`relative isolate h-[70dvh] border-l border-border lg:block lg:h-auto ${mobileView === "map" ? "block" : "hidden"}`} aria-label="Map">
          {mapsKey ? (
            <GoogleResultsMap apiKey={mapsKey} mapId={mapId} theme={theme} {...mapProps} />
          ) : googleData ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
              Google Places results must be displayed on a Google map. Set NEXT_PUBLIC_GOOGLE_MAPS_KEY to show the map.
            </div>
          ) : (
            <FallbackMap {...mapProps} />
          )}
        </section>
      </main>

      {filtersOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />
          <div className="scrollbar-thin relative ml-auto h-full w-full max-w-sm overflow-y-auto bg-surface p-4">
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-contrast">
                Show {results.length} stays
              </button>
            </div>
            <FilterPanel config={config} values={values} onChange={setFilter} onReset={() => setValues(defaults)} />
          </div>
        </div>
      )}

      <PropertyDrawer result={drawerResult} onClose={() => setDrawerId(null)} />
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-[11px] text-muted ${className}`}>
      {label}
      {children}
    </label>
  );
}
