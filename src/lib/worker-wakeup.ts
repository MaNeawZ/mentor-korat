import "server-only";
import { after } from "next/server";

/** Durable records are committed before this fast path; the scheduler retries leftovers. */
export function wakeWorker() {
  after(async () => {
    try {
      const { runWorker } = await import("./worker");
      const deadline = Date.now() + 120_000;
      // Drain short bursts without an unbounded request. DB leases coordinate
      // concurrent webhook wakes and scheduled invocations.
      for (let batch = 0; batch < 5 && Date.now() < deadline; batch++) {
        const result = await runWorker();
        if (result.processed === 0) break;
      }
    } catch {
      // Do not echo LINE payloads, tokens or provider error bodies into logs.
      console.error("Background worker deferred to scheduler", {
        code: "WORKER_WAKE_FAILED",
      });
    }
  });
}
