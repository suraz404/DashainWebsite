// Creates the PRIVATE Supabase Storage bucket for signature PNGs (idempotent).
// Usage: node scripts/create-supabase-bucket.mjs   (reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//        SUPABASE_STORAGE_BUCKET from the environment, e.g. `set -a; source .env.supabase; set +a`)
const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "signatures";
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" };
const existing = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });
if (existing.ok) {
  console.log(`Bucket "${bucket}" already exists.`);
  process.exit(0);
}
const res = await fetch(`${url}/storage/v1/bucket`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    id: bucket,
    name: bucket,
    public: false, // images are served through /api/signatures/[id], which enforces moderation
    file_size_limit: 512 * 1024,
    allowed_mime_types: ["image/png"],
  }),
});
if (!res.ok) {
  console.error(`Failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}
console.log(`Created private bucket "${bucket}".`);
