import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, readJson } from "@/lib/http";
import { parseQueryHeuristic, sanitizeParsedFilters } from "@/lib/nlp";
import { getServices } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ text: z.string().trim().min(1).max(500) });

export async function POST(req: Request) {
  try {
    const { text } = bodySchema.parse(await readJson(req));
    const { config, places } = getServices();
    const parsed = parseQueryHeuristic(text, config);
    const origin = parsed.originText ? await places.geocode(parsed.originText).catch(() => null) : null;
    return NextResponse.json({
      filters: sanitizeParsedFilters(config, parsed.filters),
      originText: parsed.originText,
      origin,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
