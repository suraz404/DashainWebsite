import "server-only";
import { randomUUID } from "crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { SignatureStatus } from "@/generated/prisma/enums";
import { getDb } from "../db";
import { getEnv } from "../env";
import { getStorage, type StorageAdapter } from "../storage";
import { validateSignaturePng } from "./validate-image";

/** The caller sent something we won't accept (maps to HTTP 400/413). Message is safe to show users. */
export class InvalidImageError extends Error {
  constructor(readonly status: 400 | 413, message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

/** Storage or database failed (maps to HTTP 500). `cause` is for server logs only, never for clients. */
export class PersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PersistenceError";
  }
}

/** What the public API may reveal about a signature. Note: no storageKey, no hash, no status filter leaks. */
export interface PublicSignature {
  id: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface SignaturePage {
  items: PublicSignature[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface ModerationItem extends PublicSignature {
  status: SignatureStatus;
}

export const MAX_PAGE_SIZE = 100;
const uuid = z.uuid();

interface Deps {
  db: PrismaClient;
  storage: StorageAdapter;
  /** New signatures start APPROVED (true) or PENDING (false, default). */
  autoApprove?: boolean;
  log?: Pick<Console, "error">;
}

const toPublic = (r: { id: string; width: number; height: number; createdAt: Date }): PublicSignature => ({
  id: r.id,
  width: r.width,
  height: r.height,
  createdAt: r.createdAt.toISOString(),
});

// Oldest first, id as tiebreaker: stable pages, and it matches the layout engine's "oldest placed first".
const APPROVED_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

export function createSignatureService({ db, storage, autoApprove = false, log = console }: Deps) {
  return {
    /**
     * Validate → store the image → insert the row. Status is APPROVED when `autoApprove` is on, else PENDING.
     * Order matters: the image is written FIRST so a row never points at a missing file; if the insert then
     * fails we delete the image so nothing is orphaned (and log, but swallow, a failed cleanup).
     */
    async submit(bytes: Buffer): Promise<{ id: string; status: "PENDING" | "APPROVED" }> {
      const check = await validateSignaturePng(bytes);
      if (!check.ok) throw new InvalidImageError(check.status, check.message);

      const id = randomUUID();
      const storageKey = `signatures/${id}.png`;
      const status = autoApprove ? ("APPROVED" as const) : ("PENDING" as const);

      try {
        await storage.put(storageKey, bytes, "image/png");
      } catch (cause) {
        throw new PersistenceError("Could not store the image", { cause });
      }

      try {
        await db.signature.create({
          data: { id, storageKey, status, width: check.width, height: check.height, byteSize: check.byteSize, sha256: check.sha256 },
        });
      } catch (cause) {
        try {
          await storage.delete(storageKey);
        } catch (cleanupError) {
          log.error(`[signatures] orphaned file after failed insert: ${storageKey}`, cleanupError);
        }
        throw new PersistenceError("Could not save the signature record", { cause });
      }
      return { id, status };
    },

    /** APPROVED only, paginated. `page` is 1-based. */
    async listApproved({ page, limit }: { page: number; limit: number }): Promise<SignaturePage> {
      const where = { status: "APPROVED" as const };
      const [rows, total] = await db.$transaction([
        db.signature.findMany({ where, orderBy: APPROVED_ORDER, skip: (page - 1) * limit, take: limit }),
        db.signature.count({ where }),
      ]);
      return { items: rows.map(toPublic), page, limit, total, hasMore: page * limit < total };
    },

    /** Everything the poster can show, in one query (the layout engine needs the whole set). */
    async listApprovedForPoster(max: number): Promise<PublicSignature[]> {
      const rows = await db.signature.findMany({ where: { status: "APPROVED" }, orderBy: APPROVED_ORDER, take: max });
      return rows.map(toPublic);
    },

    /** Image bytes. Unapproved images are only returned when `includeUnapproved` (admin) is set. */
    async getImage(id: string, { includeUnapproved = false } = {}) {
      if (!uuid.safeParse(id).success) return null;
      const row = await db.signature.findUnique({ where: { id } });
      if (!row || (row.status !== "APPROVED" && !includeUnapproved)) return null;
      const bytes = await storage.get(row.storageKey);
      return bytes ? { bytes, sha256: row.sha256, status: row.status } : null;
    },

    async listForModeration(status?: SignatureStatus): Promise<ModerationItem[]> {
      const rows = await db.signature.findMany({ where: status ? { status } : {}, orderBy: APPROVED_ORDER });
      return rows.map((r) => ({ ...toPublic(r), status: r.status }));
    },

    async setStatus(id: string, status: SignatureStatus): Promise<ModerationItem | null> {
      if (!uuid.safeParse(id).success) return null;
      const { count } = await db.signature.updateMany({ where: { id }, data: { status } });
      if (count === 0) return null;
      const row = await db.signature.findUnique({ where: { id } });
      return row ? { ...toPublic(row), status: row.status } : null;
    },
  };
}

export type SignatureService = ReturnType<typeof createSignatureService>;

/** The app-wide service, wired to the real database and storage. */
export const getSignatureService = (): SignatureService =>
  createSignatureService({
    db: getDb(),
    storage: getStorage(),
    autoApprove: getEnv().AUTO_APPROVE_SIGNATURES === "true",
  });
