import "server-only";
import { adminClient } from "../supabase/server";
import { check } from "../api";
import { parseLeave } from "./parser";
import { newToken } from "../security";

type Database = ReturnType<typeof adminClient>;
export type LineJob = { id: string; payload: Record<string, unknown> };

export async function loadLeaveTypes(db: Database, signal?: AbortSignal) {
  let query = db.from("app_settings").select("value").eq("key", "leave_types");
  if (signal) query = query.abortSignal(signal);
  const result = await query.single();
  check(result);
  if (
    !Array.isArray(result.data?.value) ||
    !result.data.value.every((type: unknown) => typeof type === "string")
  ) {
    throw new Error("INVALID_LEAVE_TYPE_CONFIGURATION");
  }
  return result.data.value as string[];
}

/** The ingestion RPC locks the event and commits leave/web notice/outbox atomically. */
export async function ingestLineJob(
  db: Database,
  job: LineJob,
  types: string[],
  signal?: AbortSignal,
) {
  const message = job.payload.message;
  if (
    !message ||
    typeof message !== "object" ||
    !("text" in message) ||
    typeof message.text !== "string"
  ) {
    throw new Error("INVALID_LINE_MESSAGE");
  }
  const parsed = parseLeave(message.text, types);
  if (!parsed) {
    const query = db
      .from("integration_events")
      .update({
        status: "DONE",
        locked_until: null,
        error_code: null,
        payload: {
          ...job.payload,
          message: { ...message, text: "[non-leave message discarded]" },
        },
      })
      .eq("id", job.id)
      .neq("status", "DONE");
    check(await (signal ? query.abortSignal(signal) : query));
    return;
  }
  const token = newToken(process.env.UPLOAD_TOKEN_SECRET || "");
  const query = db.rpc("ingest_leave", {
    event_id: job.id,
    parsed,
    hash: token.hash,
    token_nonce: token.nonce,
  });
  check(await (signal ? query.abortSignal(signal) : query));
}

/** Fast path for just-received events. Slow or failed work stays in the durable queue. */
export async function ingestIncomingLineJobs(
  db: Database,
  jobs: LineJob[],
  budgetMs = 1500,
) {
  if (!jobs.length || budgetMs <= 0) return;
  const signal = AbortSignal.timeout(Math.min(1500, Math.floor(budgetMs)));
  try {
    const types = await loadLeaveTypes(db, signal);
    for (const job of jobs.slice(0, 5)) {
      if (signal.aborted) break;
      try {
        await ingestLineJob(db, job, types, signal);
      } catch {
        // A lost response might follow a successful DB commit. Never reset the
        // event here; the queued retry will inspect its transactional state.
        console.error("LINE event deferred to worker", {
          code: "LINE_INGEST_DEFERRED",
        });
      }
    }
  } catch {
    console.error("LINE fast path deferred to worker", {
      code: "LINE_INGEST_DEFERRED",
    });
  }
}
