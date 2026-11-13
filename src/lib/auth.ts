import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { configured, sessionClient } from "./supabase/server";
import { can, type Permission, type Profile } from "./domain";
export const currentUser = cache(async () => {
  if (!configured()) return null;
  const db = await sessionClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) return null;
  const { data, error: profileError } = await db.rpc("my_profile");
  if (profileError || !data) return null;
  return data as Profile;
});
export async function requireUser(permission?: Permission) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (permission && !can(user, permission))
    redirect("/dashboard?error=forbidden");
  return user;
}
