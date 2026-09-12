import { db } from "@/lib/db";
import { requireAction } from "@/lib/roles";
import { createPurchase } from "../actions";

export default async function NewPurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string; proposal?: string }>;
}) {
  const { slug } = await params;
  const { org, user } = await requireAction(slug, "propose");
  const query = await searchParams;

  const members = await db.membership.findMany({
    where: { orgId: org.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const approved = await db.proposal.findMany({
    where: { orgId: org.id, status: "approved" },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold">Log purchase · {org.currency}</h1>
      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}
      <form action={createPurchase.bind(null, slug)} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Merchant
          <input
            name="merchant"
            maxLength={200}
            placeholder="Store name"
            className="rounded-md border bg-transparent px-3 py-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            Date
            <input
              name="purchasedAt"
              type="date"
              required
              defaultValue={today}
              className="rounded-md border bg-transparent px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Paid by
            <select
              name="paidById"
              defaultValue={user.id}
              className="rounded-md border bg-transparent px-3 py-2"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name ?? m.user.email} ({m.role})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            Subtotal
            <input
              name="subtotal"
              required
              inputMode="decimal"
              placeholder="0.00"
              className="rounded-md border bg-transparent px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Tax
            <input
              name="tax"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue="0"
              className="rounded-md border bg-transparent px-3 py-2"
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          Link to approved proposal (optional)
          <select
            name="proposalId"
            defaultValue={query.proposal ?? ""}
            className="rounded-md border bg-transparent px-3 py-2"
          >
            <option value="">Standalone (no proposal)</option>
            {approved.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Notes (optional)
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            className="rounded-md border bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="isRefund" type="checkbox" />
          This is a refund
        </label>
        <button
          type="submit"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Log purchase
        </button>
      </form>
    </div>
  );
}
