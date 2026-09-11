import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">PaperBank</h1>
      <p className="text-sm opacity-70">
        Collaborative spend-tracking + manual reimbursement log. No banks, no
        cards, no transfers — ledger only.
      </p>
      <Link
        href="/demo"
        className="rounded-md border px-4 py-2 text-sm font-medium"
      >
        View demo org →
      </Link>
    </main>
  );
}
