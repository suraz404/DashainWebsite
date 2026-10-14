"use client";

import { useEffect, useState } from "react";

// Pending signatures need the admin header, so fetch the PNG as a blob for preview.
function Preview({ id, token }: { id: string; token: string }) {
  const [src, setSrc] = useState("");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let url = "";
    fetch(`/api/signatures/${id}`, { headers: { "x-admin-token": token } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => setSrc((url = URL.createObjectURL(b))))
      .catch(() => setMissing(true)); // record exists but its file doesn't: say so instead of an empty box
    return () => URL.revokeObjectURL(url);
  }, [id, token]);
  if (missing) {
    return <span className="flex h-12 w-24 items-center justify-center rounded bg-red-50 text-xs text-red-700">Image missing</span>;
  }
  if (!src) return <span className="h-12 w-24 rounded bg-neutral-100" />; // placeholder until the blob loads
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-12 w-24 rounded bg-white object-contain" />;
}

type Item = { id: string; status: string; createdAt: string };

export default function Admin() {
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    const res = await fetch("/api/admin", { headers: { "x-admin-token": token } });
    if (!res.ok) return setError("Wrong token");
    setError("");
    setItems(await res.json());
  };
  const set = async (id: string, status: string) => {
    await fetch(`/api/signatures/${id}`, {
      method: "PATCH",
      headers: { "x-admin-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this signature permanently? This cannot be undone.")) return;
    const res = await fetch(`/api/signatures/${id}`, { method: "DELETE", headers: { "x-admin-token": token } });
    await load(); // load() clears the error, so report a failure after it
    if (!res.ok && res.status !== 404) setError("Could not delete the signature.");
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-bold">Moderation</h1>
      <div className="mb-4 flex gap-2">
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Admin token" className="flex-1 rounded border px-3 py-2" />
        <button onClick={load} className="rounded bg-red-700 px-4 py-2 text-white">Load</button>
      </div>
      {error && <p className="text-red-700">{error}</p>}
      <ul className="grid gap-3">
        {items?.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded border p-2">
            <Preview id={s.id} token={token} />
            <span className="w-24 text-sm font-medium">{s.status}</span>
            <span className="flex-1 truncate text-xs text-neutral-500">{s.id}</span>
            <button onClick={() => set(s.id, "APPROVED")} className="rounded border px-2 py-1">Approve</button>
            <button onClick={() => set(s.id, "REJECTED")} className="rounded border px-2 py-1">Reject</button>
            <button onClick={() => remove(s.id)} className="rounded border border-red-300 px-2 py-1 text-red-700">Delete</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
