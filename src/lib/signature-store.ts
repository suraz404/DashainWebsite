import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type Status = "pending" | "approved" | "rejected";
export type SignatureMeta = { id: string; status: Status; createdAt: string };

// SIGNATURE_DATA_DIR lets tests use an isolated, empty store.
const DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.SIGNATURE_DATA_DIR ?? "data");
const INDEX = path.join(DIR, "signatures.json");

// Serialise writes so two requests can't clobber the JSON index.
let queue: Promise<unknown> = Promise.resolve();
const locked = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

async function readAll(): Promise<SignatureMeta[]> {
  try {
    return JSON.parse(await fs.readFile(INDEX, "utf8"));
  } catch {
    return [];
  }
}

export const listSignatures = async (status?: Status) =>
  (await readAll()).filter((s) => !status || s.status === status);

export const addSignature = (png: Buffer, status: Status) =>
  locked(async () => {
    await fs.mkdir(DIR, { recursive: true });
    const meta: SignatureMeta = { id: randomUUID(), status, createdAt: new Date().toISOString() };
    await fs.writeFile(path.join(DIR, `${meta.id}.png`), png);
    await fs.writeFile(INDEX, JSON.stringify([...(await readAll()), meta], null, 2));
    return meta;
  });

export const setStatus = (id: string, status: Status) =>
  locked(async () => {
    const all = await readAll();
    const item = all.find((s) => s.id === id);
    if (!item) return null;
    item.status = status;
    await fs.writeFile(INDEX, JSON.stringify(all, null, 2));
    return item;
  });

export async function readPng(id: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null; // blocks path traversal
  try {
    return await fs.readFile(path.join(DIR, `${id}.png`));
  } catch {
    return null;
  }
}
