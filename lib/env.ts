import { z } from "zod";

const optional = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional());

export const serverEnvSchema = z
  .object({
    RATES_PROVIDER: z.enum(["mock", "serpapi"]).default("mock"),
    GOOGLE_MAPS_API_KEY: optional,
    SERPAPI_KEY: optional,
    ANTHROPIC_API_KEY: optional,
    ANTHROPIC_MODEL: z.preprocess((v) => (v === "" ? undefined : v), z.string().default("claude-sonnet-4-6")),
    DATABASE_URL: optional,
    UPSTASH_REDIS_URL: optional,
    UPSTASH_REDIS_TOKEN: optional,
  })
  .refine((e) => e.RATES_PROVIDER !== "serpapi" || !!e.SERPAPI_KEY, {
    message: "RATES_PROVIDER=serpapi requires SERPAPI_KEY",
    path: ["SERPAPI_KEY"],
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}
