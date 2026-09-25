import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { resolvePhotoUri } from "@/lib/providers/google/places";

export const runtime = "nodejs";

/** Proxies Google Places photo lookups so the server API key never reaches the browser. */
export async function GET(req: Request) {
  const { GOOGLE_MAPS_API_KEY } = getServerEnv();
  if (!GOOGLE_MAPS_API_KEY) return jsonError(404, "photos unavailable");
  const params = new URL(req.url).searchParams;
  const name = params.get("name") ?? "";
  const width = Math.min(1600, Math.max(100, Number(params.get("w")) || 800));
  const uri = await resolvePhotoUri(GOOGLE_MAPS_API_KEY, name, width);
  if (!uri) return jsonError(404, "photo not found");
  return NextResponse.redirect(uri, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
}
