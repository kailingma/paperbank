export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">org: {slug}</h1>
      <div className="mt-6 grid gap-4">
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Spend</h2>
          <p className="text-sm opacity-60">No proposals yet. (Phase 1)</p>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Pending approvals</h2>
          <p className="text-sm opacity-60">Nothing pending. (Phase 1)</p>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Owed reimbursements</h2>
          <p className="text-sm opacity-60">All settled. (Phase 2)</p>
        </section>
      </div>
    </main>
  );
}
