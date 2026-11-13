import { createClient } from "@supabase/supabase-js";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const name = "mentor-korat-evidence";
const { data, error } = await db.storage.getBucket(name);
if (error && !/not found/i.test(error.message))
  throw new Error("Cannot inspect evidence bucket");
if (!data) {
  const r = await db.storage.createBucket(name, {
    public: false,
    fileSizeLimit: 8388608,
    allowedMimeTypes: ["image/webp"],
  });
  if (r.error) throw new Error("Cannot create private evidence bucket");
} else if (data.public)
  throw new Error(
    "Evidence bucket is public. Make it private before proceeding.",
  );
console.log(
  "Private evidence bucket verified. No storage tables were modified directly.",
);
