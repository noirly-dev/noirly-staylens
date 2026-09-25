/* eslint-disable @next/next/no-img-element -- Places photo URLs are short-lived redirects; next/image adds nothing here. */
import type { Property } from "@/lib/types";
import { hashString } from "@/lib/util/hash";

export function PhotoThumb({ property, className = "", index = 0 }: { property: Property; className?: string; index?: number }) {
  const photo = property.photos[index];
  if (photo) {
    return <img src={photo.url} alt={property.name} loading="lazy" className={`object-cover ${className}`} />;
  }
  const hue = hashString(property.placeId) % 360;
  const initials = property.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center text-lg font-semibold text-white/80 ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 50) % 360} 55% 18%))` }}
    >
      {initials}
    </div>
  );
}
