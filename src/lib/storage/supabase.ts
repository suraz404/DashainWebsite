import "server-only";
import type { StorageAdapter } from "./types";

// Same key rules as LocalDiskStorage: no dots except the extension, so no "..".
const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*\.png$/;

/**
 * Production storage: a PRIVATE Supabase Storage bucket, spoken to over its REST API with the service-role
 * key (server only — never sent to the browser). The app keeps serving images through /api/signatures/[id],
 * so moderation rules still apply and the bucket never needs to be public.
 */
export class SupabaseStorage implements StorageAdapter {
  private readonly base: string;
  constructor(
    url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {
    this.base = `${url.replace(/\/+$/, "")}/storage/v1/object`;
  }

  private objectUrl(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    return `${this.base}/${encodeURIComponent(this.bucket)}/${key}`;
  }

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const res = await fetch(this.objectUrl(key), {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "max-age=31536000" }),
      body: new Uint8Array(bytes),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase upload failed (${res.status}): ${await res.text().catch(() => "")}`);
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await fetch(this.objectUrl(key), { headers: this.headers(), cache: "no-store" });
    // Supabase answers a missing object with 400 or 404 depending on version.
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`Supabase download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    this.objectUrl(key); // validates the key
    const res = await fetch(`${this.base}/${encodeURIComponent(this.bucket)}`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
      cache: "no-store",
    });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase delete failed (${res.status})`);
  }
}
