import PosterFrame from "@/components/PosterFrame";
import PosterSignatures from "@/components/PosterSignatures";
import { listSignatures } from "@/lib/signature-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Happy Dashain — CSITAN" };

export default async function PosterPage() {
  const ids = (await listSignatures("approved")).map((s) => s.id);
  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-900 p-2">
      {/* Width is capped so the 3:4 poster always fits the screen height too. */}
      <div className="w-full" style={{ maxWidth: "min(100%, calc((100svh - 1rem) * 0.75))" }}>
        <PosterFrame>
          <PosterSignatures initialIds={ids} />
        </PosterFrame>
      </div>
    </main>
  );
}
