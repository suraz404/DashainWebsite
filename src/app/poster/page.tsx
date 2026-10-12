import LayoutDebugLayer from "@/components/LayoutDebugLayer";
import PosterFrame from "@/components/PosterFrame";
import PosterSignatures from "@/components/PosterSignatures";
import { composeSignatures } from "@/lib/composition/compose";
import { toSignatureInput } from "@/lib/composition/from-api";
import { fixtureInputs } from "@/lib/dev-fixtures";
import { listPosterSignatures } from "@/lib/signature-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Happy Dashain — CSITAN" };

export default async function PosterPage({
  searchParams,
}: {
  searchParams: Promise<{ fixtures?: string; debug?: string }>;
}) {
  const query = await searchParams;
  // Dev-only tools: ignored entirely in production builds.
  const dev = process.env.NODE_ENV !== "production";
  const fixtures = dev && query.fixtures ? fixtureInputs(Number(query.fixtures)) : [];
  const debug = dev && query.debug === "1";

  const real = fixtures.length ? [] : (await listPosterSignatures()).map(toSignatureInput);
  const initial = fixtures.length ? fixtures : real;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 bg-neutral-900 p-2">
      {fixtures.length > 0 && (
        <p className="rounded bg-amber-300 px-2 py-1 text-xs font-semibold text-black" data-dev-banner>
          DEV FIXTURES: {fixtures.length} fake signatures. Not real submissions.
        </p>
      )}
      {/* Width is capped so the 3:4 poster always fits the screen height too. */}
      <div className="w-full" style={{ maxWidth: "min(100%, calc((100svh - 1rem) * 0.75))" }}>
        <PosterFrame>
          <PosterSignatures initial={initial} poll={fixtures.length === 0} />
          {debug && <LayoutDebugLayer result={composeSignatures(initial)} />}
        </PosterFrame>
      </div>
    </main>
  );
}
