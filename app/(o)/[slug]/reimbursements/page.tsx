import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { ROLE_RANK, requireAction } from "@/lib/roles";
import { markPaid } from "./actions";

export default async function ReimbursementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug } = await params;
  const { org, membership } = await requireAction(slug, "read");
  const query = await searchParams;
  const canPay = ROLE_RANK[membership.role] >= ROLE_RANK.admin;

  const rows = await db.reimbursement.findMany({
    where: { orgId: org.id },
    include: { purchase: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const payees = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.payeeId) } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = (uid: string) =>
    payees.find((u) => u.id === uid)?.name ??
    payees.find((u) => u.id === uid)?.email ??
    uid.slice(0, 8);

  const owed = rows.filter((r) => r.status === "owed");
  const owedTotal = owed.reduce((s, r) => s + r.amountCents, 0);
  const paid = rows.filter((r) => r.status === "reimbursed");

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-bold">Reimbursements</h1>
      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}

      <section>
        <h2 className="mb-2 font-semibold">
          Owed ({owed.length}) · {formatCents(owedTotal, org.currency)}
        </h2>
        <ul className="grid gap-2">
          {owed.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/${slug}/purchases/${r.purchaseId}`}
                  className="hover:underline"
                >
                  {r.purchase.merchant ?? "Purchase"}
                </Link>
                <span className="opacity-70">→ {nameOf(r.payeeId)}</span>
                <span className="ml-auto font-semibold">
                  {formatCents(r.amountCents, r.currency)}
                </span>
              </div>
              {canPay && (
                <form
                  action={markPaid.bind(null, slug, r.id)}
                  className="mt-2 flex flex-wrap gap-2"
                >
                  <select
                    name="via"
                    defaultValue="cash"
                    className="rounded border bg-transparent px-2 py-1 text-sm"
                  >
                    <option value="cash">cash</option>
                    <option value="venmo">venmo</option>
                    <option value="zelle">zelle</option>
                    <option value="other">other</option>
                  </select>
                  <input
                    name="note"
                    maxLength={200}
                    placeholder="Note (optional)"
                    className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded border border-green-500/50 px-2 py-1 text-xs text-green-600"
                  >
                    Mark paid
                  </button>
                </form>
              )}
            </li>
          ))}
          {owed.length === 0 && (
            <p className="text-sm opacity-60">Nothing owed.</p>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Paid log ({paid.length})</h2>
        <ul className="grid gap-2">
          {paid.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm opacity-80"
            >
              <span>{r.purchase.merchant ?? "Purchase"}</span>
              <span className="opacity-70">→ {nameOf(r.payeeId)}</span>
              <StatusPill status={r.status} />
              <span className="ml-auto">
                {formatCents(r.amountCents, r.currency)}
                <span className="ml-2 text-xs opacity-60">
                  {r.paidViaNote ?? ""}
                  {r.markedPaidAt
                    ? ` · ${r.markedPaidAt.toLocaleDateString()}`
                    : ""}
                </span>
              </span>
            </li>
          ))}
          {paid.length === 0 && (
            <p className="text-sm opacity-60">No payments recorded.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
