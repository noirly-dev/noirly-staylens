import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export function getAnthropic(apiKey: string): Anthropic {
  client ??= new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return client;
}
