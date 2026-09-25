import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ error, details }, { status });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ZodError([{ code: "custom", message: "body must be valid JSON", path: [], input: undefined }]);
  }
}

export function handleRouteError(err: unknown) {
  if (err instanceof ZodError) return jsonError(400, "invalid request", err.issues);
  console.error(err);
  return jsonError(500, err instanceof Error ? err.message : "internal error");
}
