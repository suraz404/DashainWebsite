import type { PosterSignatureDTO } from "@/lib/composition/from-api";

interface Page {
  items: PosterSignatureDTO[];
  hasMore: boolean;
}

/**
 * Fetches ALL approved signatures by walking the paginated API (the layout engine needs the whole set).
 * Throws on any HTTP/network/shape error so callers can decide how to degrade. `maxPages` bounds the work.
 */
export async function fetchApprovedSignatures(
  fetchImpl: typeof fetch = fetch,
  { pageSize = 100, maxPages = 5 }: { pageSize?: number; maxPages?: number } = {},
): Promise<PosterSignatureDTO[]> {
  const all: PosterSignatureDTO[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchImpl(`/api/signatures?page=${page}&limit=${pageSize}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Signatures request failed (${res.status})`);
    const body = (await res.json()) as Page;
    if (!Array.isArray(body.items)) throw new Error("Unexpected signatures response");
    all.push(...body.items);
    if (!body.hasMore) break;
  }
  return all;
}
