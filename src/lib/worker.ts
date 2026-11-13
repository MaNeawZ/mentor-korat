import "server-only";
import { adminClient } from "./supabase/server";
import { check } from "./api";
import { parseLeave } from "./line/parser";
import { newToken, deriveToken } from "./security";
import { discordPayload } from "./discord";
import { statuses, type Status } from "./domain";
class DeliveryError extends Error {
  constructor(
    public code: string,
    public retry = 60,
  ) {
    super(code);
  }
}
async function discordRequest(
  url: string,
  body: unknown,
  method = "POST",
  bot = false,
) {
  const r = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(bot ? { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) {
    let retry = 60;
    if (r.status === 429) {
      const data = await r.json().catch(() => ({}));
      retry = Math.max(1, Math.ceil(Number(data.retry_after) || 60));
    }
    throw new DeliveryError(`DISCORD_${r.status}`, retry);
  }
  return r.status === 204 ? null : await r.json();
}
export async function runWorker() {
  const db = adminClient();
  const line = await db.rpc("claim_jobs", { queue: "line" });
  check(line);
  const types = await db
    .from("app_settings")
    .select("value")
    .eq("key", "leave_types")
    .single();
  check(types);
  let processed = 0;
  for (const job of line.data || []) {
    try {
      const parsed = parseLeave(job.payload.message.text, types.data!.value);
      if (!parsed) {
        check(
          await db
            .from("integration_events")
            .update({
              status: "DONE",
              payload: {
                ...job.payload,
                message: {
                  ...job.payload.message,
                  text: "[non-leave message discarded]",
                },
              },
            })
            .eq("id", job.id),
        );
        continue;
      }
      const t = newToken(process.env.UPLOAD_TOKEN_SECRET || "");
      check(
        await db.rpc("ingest_leave", {
          event_id: job.id,
          parsed,
          hash: t.hash,
          token_nonce: t.nonce,
        }),
      );
      processed++;
    } catch {
      check(
        await db
          .from("integration_events")
          .update({
            status: job.attempts >= 8 ? "FAILED" : "PENDING",
            available_at: new Date(
              Date.now() + Math.min(3600, 2 ** job.attempts * 15) * 1000,
            ).toISOString(),
            locked_until: null,
            error_code: "PROCESSING_FAILED",
          })
          .eq("id", job.id),
      );
    }
  }
  const outbox = await db.rpc("claim_jobs", { queue: "discord" });
  check(outbox);
  const mode = await db
    .from("app_settings")
    .select("value")
    .eq("key", "discord_mode")
    .single();
  check(mode);
  for (const job of outbox.data || []) {
    try {
      if (!process.env.DISCORD_WEBHOOK_URL)
        throw new DeliveryError("DISCORD_NOT_CONFIGURED", 300);
      const result = await db
        .from("leave_requests")
        .select("*,employees(code,name,departments(name))")
        .eq("id", job.leave_id)
        .single();
      check(result);
      const l = result.data!;
      const mentor = l.mentor_id
        ? await db
            .from("app_users")
            .select("discord_user_id")
            .eq("id", l.mentor_id)
            .single()
        : null;
      const map = await db
        .from("discord_messages")
        .select("message_id")
        .eq("leave_id", l.id)
        .maybeSingle();
      check(map);
      const base = new URL(process.env.DISCORD_WEBHOOK_URL);
      if (
        base.hostname !== "discord.com" ||
        !base.pathname.startsWith("/api/webhooks/")
      )
        throw new DeliveryError("DISCORD_URL_INVALID");
      const payload = discordPayload(
        {
          id: l.id,
          document_number: l.document_number,
          reason: l.reason,
          status:
            mode.data?.value === "events" &&
            statuses.includes(job.kind as Status)
              ? (job.kind as Status)
              : (l.status as Status),
          leave_date: l.leave_date,
          leave_type: l.leave_type,
          employee_code: l.employees.code,
          employee_name: l.employees.name,
          department: l.employees.departments?.name || "—",
          discord_user_id: mentor?.data?.discord_user_id || null,
        },
        process.env.NEXT_PUBLIC_APP_URL!,
      );
      let message;
      if (map.data && mode.data?.value === "edit") {
        base.pathname += `/messages/${map.data.message_id}`;
        try {
          message = await discordRequest(base.toString(), payload, "PATCH");
        } catch (e) {
          if (!(e instanceof DeliveryError) || e.code !== "DISCORD_404")
            throw e;
          base.pathname = base.pathname.replace(
            `/messages/${map.data.message_id}`,
            "",
          );
          base.searchParams.set("wait", "true");
          message = await discordRequest(base.toString(), payload);
        }
      } else {
        base.searchParams.set("wait", "true");
        message = await discordRequest(base.toString(), payload);
      }
      if (message?.id)
        check(
          await db
            .from("discord_messages")
            .upsert({ leave_id: l.id, message_id: message.id }),
        );
      if (
        process.env.DISCORD_BOT_TOKEN &&
        mentor?.data?.discord_user_id &&
        ["WAITING_EVIDENCE", "REUPLOAD_REQUIRED"].includes(job.kind) &&
        ["WAITING_EVIDENCE", "REUPLOAD_REQUIRED"].includes(l.status)
      ) {
        try {
          const token = await db
            .from("evidence_upload_tokens")
            .select("nonce")
            .eq("leave_id", l.id)
            .eq("state", "ACTIVE")
            .maybeSingle();
          check(token);
          if (token.data) {
            const dm = await discordRequest(
              "https://discord.com/api/v10/users/@me/channels",
              { recipient_id: mentor.data.discord_user_id },
              "POST",
              true,
            );
            await discordRequest(
              `https://discord.com/api/v10/channels/${dm.id}/messages`,
              {
                content: `ลิงก์อัปโหลด ${l.document_number}\n${process.env.NEXT_PUBLIC_APP_URL}/upload/${deriveToken(token.data.nonce, process.env.UPLOAD_TOKEN_SECRET || "")}`,
                allowed_mentions: { parse: [] },
              },
              "POST",
              true,
            );
          }
        } catch {
          check(
            await db.from("notifications").insert({
              user_id: l.mentor_id,
              leave_id: l.id,
              title: "ส่ง Discord DM ไม่สำเร็จ กรุณาคัดลอกลิงก์จากหน้าใบลา",
            }),
          );
        }
      }
      check(
        await db
          .from("notification_outbox")
          .update({ status: "DONE", locked_until: null, error_code: null })
          .eq("id", job.id),
      );
      processed++;
    } catch (e) {
      const retry = e instanceof DeliveryError ? e.retry : 60;
      check(
        await db
          .from("notification_outbox")
          .update({
            status: job.attempts >= 8 ? "FAILED" : "PENDING",
            available_at: new Date(
              Date.now() +
                Math.max(retry, Math.min(3600, 2 ** job.attempts * 15)) * 1000,
            ).toISOString(),
            locked_until: null,
            error_code: e instanceof DeliveryError ? e.code : "DELIVERY_FAILED",
          })
          .eq("id", job.id),
      );
    }
  }
  return { processed };
}
