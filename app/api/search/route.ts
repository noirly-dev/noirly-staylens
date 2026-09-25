import { NextResponse } from "next/server";
import { handleRouteError, readJson } from "@/lib/http";
import { getServices } from "@/lib/providers";
import { runSearch } from "@/lib/search/pipeline";
import { buildSearchRequestSchema } from "@/lib/search/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const services = getServices();
    const request = buildSearchRequestSchema(services.config).parse(await readJson(req));
    return NextResponse.json(await runSearch(request, services));
  } catch (err) {
    return handleRouteError(err);
  }
}
