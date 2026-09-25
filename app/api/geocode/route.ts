import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/http";
import { getServices } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) return jsonError(400, "missing q");
    const point = await getServices().places.geocode(q);
    return point ? NextResponse.json(point) : jsonError(404, `could not find "${q}"`);
  } catch (err) {
    return handleRouteError(err);
  }
}
