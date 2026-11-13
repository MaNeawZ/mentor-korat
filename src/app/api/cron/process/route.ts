import { NextResponse } from "next/server";
import { errorResponse, workerAuth } from "@/lib/api";
import { runWorker } from "@/lib/worker";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    workerAuth(request);
    return NextResponse.json(await runWorker());
  } catch (e) {
    return errorResponse(e);
  }
}
