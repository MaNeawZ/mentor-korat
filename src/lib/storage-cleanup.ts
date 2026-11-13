import "server-only";
import { adminClient } from "./supabase/server";
import { check } from "./api";
import { deleteDiscordEvidence } from "./discord-evidence";

type CleanupJob = {
  id: string;
  path: string;
  attempts: number;
  provider?: string;
  discord_webhook_id?: string;
  discord_message_id?: string;
};
const ownPath = /^[0-9a-f-]{36}\/[0-9A-Za-z_-]+\.webp$/;
export async function processEvidenceCleanup(
  db: ReturnType<typeof adminClient>,
) {
  const claimed = await db.rpc("claim_storage_cleanup");
  // Safe rollout: older databases continue to process LINE before this optional
  // feature migration is installed. The clear-data action itself fails closed.
  if (claimed.error && ["PGRST202", "42883"].includes(claimed.error.code))
    return 0;
  check(claimed);
  const jobs = (claimed.data || []) as CleanupJob[];
  if (!jobs.length) return 0;
  const invalid = jobs.filter((job) => !ownPath.test(job.path));
  if (invalid.length)
    check(
      await db
        .from("storage_cleanup_jobs")
        .update({
          status: "FAILED",
          locked_until: null,
          error_code: "INVALID_EVIDENCE_PATH",
        })
        .in(
          "id",
          invalid.map((job) => job.id),
        ),
    );
  const valid = jobs.filter((job) => ownPath.test(job.path));
  if (!valid.length) return invalid.length;
  let processed = invalid.length;
  async function failed(job: CleanupJob, code: string) {
    check(
      await db
        .from("storage_cleanup_jobs")
        .update({
          status: job.attempts >= 8 ? "FAILED" : "PENDING",
          locked_until: null,
          error_code: code,
          available_at: new Date(
            Date.now() + Math.min(3600, 2 ** job.attempts * 15) * 1000,
          ).toISOString(),
        })
        .eq("id", job.id),
    );
  }
  for (const job of valid.filter((job) => job.provider === "discord")) {
    try {
      await deleteDiscordEvidence({
        discord_webhook_id: job.discord_webhook_id || "",
        discord_message_id: job.discord_message_id || "",
      });
      check(
        await db
          .from("storage_cleanup_jobs")
          .update({ status: "DONE", locked_until: null, error_code: null })
          .eq("id", job.id),
      );
      processed++;
    } catch {
      await failed(job, "DISCORD_CLEANUP_FAILED");
    }
  }
  const storage = valid.filter(
    (job) => !job.provider || job.provider === "supabase",
  );
  const unknown = valid.filter(
    (job) =>
      job.provider && job.provider !== "supabase" && job.provider !== "discord",
  );
  for (const job of unknown) {
    check(
      await db
        .from("storage_cleanup_jobs")
        .update({
          status: "FAILED",
          locked_until: null,
          error_code: "INVALID_EVIDENCE_PROVIDER",
        })
        .eq("id", job.id),
    );
    processed++;
  }
  if (!storage.length) return processed;
  try {
    check(
      await db.storage
        .from("mentor-korat-evidence")
        .remove(storage.map((job) => job.path)),
    );
    check(
      await db
        .from("storage_cleanup_jobs")
        .update({ status: "DONE", locked_until: null, error_code: null })
        .in(
          "id",
          storage.map((job) => job.id),
        ),
    );
    return processed + storage.length;
  } catch {
    // Keep exact object paths for retry; never remove a bucket or scan other apps.
    for (const job of storage) await failed(job, "STORAGE_CLEANUP_FAILED");
    return processed;
  }
}
