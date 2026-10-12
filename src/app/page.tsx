import SignatureCanvas from "@/components/SignatureCanvas";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-gradient-to-b from-[#fbf3e4] to-[#efd9b0] px-4 py-8">
      <SignatureCanvas />
    </main>
  );
}
