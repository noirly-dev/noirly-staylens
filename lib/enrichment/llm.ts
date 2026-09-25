import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { chunk, mapLimit } from "@/lib/util/concurrency";
import type { Enricher, EnrichmentInput } from "./types";
import type { TagDef } from "./vocabulary";

const BATCH_SIZE = 8;
const MAX_REVIEWS = 5;
const MAX_CHARS = 600;

const SYSTEM = `You tag holiday stays (resorts, villas, homestays) with attributes for a search engine.
You are given a fixed tag vocabulary and, for each stay, its description, a few guest reviews and amenities.
Assign a tag only when the text gives clear, direct evidence for it. Mixed or negative evidence ("can be noisy",
"Wi-Fi was patchy") means do not assign the tag. Never invent tags outside the vocabulary.
Return one result per stay, using the exact placeId given.`;

function clip(text: string) {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text;
}

export function buildEnrichmentPrompt(items: readonly EnrichmentInput[], vocabulary: readonly TagDef[]): string {
  const vocab = vocabulary.map((v) => `- ${v.tag}: ${v.label}${v.description ? ` — ${v.description}` : ""}`).join("\n");
  const stays = items
    .map(({ property, details }) =>
      [
        `<stay placeId="${property.placeId}">`,
        `name: ${property.name}`,
        details?.description ? `description: ${clip(details.description)}` : null,
        property.amenities.length ? `amenities: ${property.amenities.join(", ")}` : null,
        ...(details?.reviews ?? []).slice(0, MAX_REVIEWS).map((r) => `review: ${clip(r)}`),
        `</stay>`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  return `<vocabulary>\n${vocab}\n</vocabulary>\n\n<stays>\n${stays}\n</stays>`;
}

/** LLM tag extraction with structured outputs, batched several stays per request. */
export class LlmEnricher implements Enricher {
  readonly name: string;

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {
    this.name = `llm:${model}`;
  }

  async enrich(items: readonly EnrichmentInput[], vocabulary: readonly TagDef[]) {
    const out = new Map<string, string[]>();
    if (!items.length || !vocabulary.length) return out;
    const tags = vocabulary.map((v) => v.tag) as [string, ...string[]];
    const schema = z.object({
      results: z.array(z.object({ placeId: z.string(), tags: z.array(z.enum(tags)) })),
    });

    await mapLimit(chunk(items, BATCH_SIZE), 3, async (batch) => {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: "user", content: buildEnrichmentPrompt(batch, vocabulary) }],
        output_config: { format: zodOutputFormat(schema) },
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        throw new Error(`enrichment returned no structured output (stop_reason=${response.stop_reason})`);
      }
      const ids = new Set(batch.map((b) => b.property.placeId));
      for (const r of response.parsed_output.results) {
        if (ids.has(r.placeId)) out.set(r.placeId, [...new Set(r.tags)]);
      }
      // A stay the model skipped gets no tags rather than being retried forever.
      for (const id of ids) if (!out.has(id)) out.set(id, []);
    });
    return out;
  }
}
