import { SearchApp } from "@/components/SearchApp";
import { defaultFilterValues, getFilterConfig } from "@/lib/config";
import { defaultStayDates } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = getFilterConfig();
  return (
    <SearchApp
      config={config}
      defaults={defaultFilterValues(config)}
      initialDates={defaultStayDates()}
      mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || undefined}
      mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || undefined}
    />
  );
}
