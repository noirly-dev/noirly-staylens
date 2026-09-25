import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { handleRouteError, readJson } from "@/lib/http";
import { getAnthropic } from "@/lib/llm";
import { parseQueryHeuristic, sanitizeParsedFilters, type ParsedQuery } from "@/lib/nlp";
import { parseQueryLlm } from "@/lib/nlp/llm";
import { getServices } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ text: z.string().trim().min(1).max(500) });

export async function POST(req: Request) {
  try {
    const { text } = bodySchema.parse(await readJson(req));
    const env = getServerEnv();
    const { config, places } = getServices();

    let parsed: ParsedQuery;
    let parser: "llm" | "heuristic" = "heuristic";
    if (env.ANTHROPIC_API_KEY) {
      try {
        parsed = await parseQueryLlm(text, config, getAnthropic(env.ANTHROPIC_API_KEY), env.ANTHROPIC_MODEL);
        parser = "llm";
      } catch (err) {
        console.warn("[parse-query] LLM parse failed, using heuristic", err);
        parsed = parseQueryHeuristic(text, config);
      }
    } else {
      parsed = parseQueryHeuristic(text, config);
    }

    const origin = parsed.originText ? await places.geocode(parsed.originText).catch(() => null) : null;
    return NextResponse.json({
      filters: sanitizeParsedFilters(config, parsed.filters),
      originText: parsed.originText,
      origin,
      parser,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
