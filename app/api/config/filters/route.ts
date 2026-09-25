import { NextResponse } from "next/server";
import { getFilterConfig } from "@/lib/config";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(getFilterConfig());
}
