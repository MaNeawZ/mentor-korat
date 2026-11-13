import { pathToFileURL } from "node:url";

/**
 * Invokes the existing worker without database credentials or secret URL params.
 * @param {{baseUrl?: string, secret?: string, bypassSecret?: string}} config
 * @param {typeof fetch} [request]
 */
export async function invokeWorker(
  { baseUrl, secret, bypassSecret },
  request = fetch,
) {
  let origin;
  try {
    origin = new URL(baseUrl);
  } catch {
    throw new Error("WORKER_BASE_URL must be a valid HTTPS application origin");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new Error(
      "WORKER_BASE_URL must be an HTTPS origin without credentials, paths, or query parameters",
    );
  }
  if (
    typeof secret !== "string" ||
    secret.length < 32 ||
    /[\r\n]/.test(secret)
  ) {
    throw new Error(
      "CRON_SECRET must contain at least 32 characters and match Vercel",
    );
  }
  const headers = {
    Authorization: `Bearer ${secret}`,
    Accept: "application/json",
  };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;
  let response;
  try {
    response = await request(new URL("/api/cron/process", origin), {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(270_000),
    });
  } catch {
    // Never echo the request, headers, URL, or raw transport error into CI logs.
    throw new Error(
      "Worker request failed or timed out. Check the deployment URL, protection settings, and worker logs.",
    );
  }
  if (!response.ok)
    throw new Error(
      `Worker returned HTTP ${response.status}. Check deployment configuration and authentication.`,
    );
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "Worker did not return JSON. Check the application URL and deployment protection.",
    );
  }
  if (!Number.isSafeInteger(body?.processed) || body.processed < 0) {
    throw new Error(
      "Worker returned an unexpected response; no successful run was confirmed.",
    );
  }
  return body.processed;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const processed = await invokeWorker({
      baseUrl: process.env.WORKER_BASE_URL,
      secret: process.env.CRON_SECRET,
      bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    });
    console.log(`Worker completed. Processed jobs: ${processed}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
