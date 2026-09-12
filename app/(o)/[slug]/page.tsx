import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { requireAction } from "@/lib/roles";

export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireAction(slug, "read");

  const [proposals, purchases, reimbursements, activity] = await Promise.all([
    db.proposal.findMany({
      where: { orgId: org.id },
      select: { status: true, totalCents: true },
    }),
    db.purchase.findMany({
      where: { orgId: org.id },
      select: { id: true, status: true, totalCents: true, receipts: { select: { id: true } } },
    }),
    db.reimbursement.findMany({
      where: { orgId: org.id, status: "owed" },
      select: { amountCents: true, payeeId: true },
    }),
    db.auditLog.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const approvedTotal = proposals
    .filter((p) => p.status === "approved" || p.status === "completed")
    .reduce((s, p) => s + p.totalCents, 0);
  const spentTotal = purchases
    .filter((p) => p.status === "verified")
    .reduce((s, p) => s + p.totalCents, 0);
  const pendingCount = proposals.filter((p) => p.status === "submitted").length;
  const owedTotal = reimbursements.reduce((s, r) => s + r.amountCents, 0);
  const missingReceipts = purchases.filter(
    (p) => p.status === "logged" && p.receipts.length === 0,
  ).length;

  const actors = await db.user.findMany({
    where: { id: { in: [...new Set(activity.map((a) => a.actorId))] } },
    select: { id: true, name: true, email: true },
  });
  const actorName = (id: string) =>
    actors.find((a) => a.id === id)?.name ??
    actors.find((a) => a.id === id)?.email ??
    "system";

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold">
        Balance: {formatCents(approvedTotal - spentTotal, org.currency)}
      </h1>
      <p className="-mt-3 text-xs opacity-60">
        approved {formatCents(approvedTotal, org.currency)} − spent{" "}
        {formatCents(spentTotal, org.currency)}
      </p>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Pending approvals ({pendingCount})</h2>
        {pendingCount > 0 ? (
          <Link
            href={`/${slug}/proposals?status=submitted`}
            className="text-sm underline"
          >
            Review submitted proposals →
          </Link>
        ) : (
          <p className="text-sm opacity-60">Nothing pending.</p>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">
          Owed reimbursements · {formatCents(owedTotal, org.currency)}
        </h2>
        {reimbursements.length > 0 ? (
          <Link
            href={`/${slug}/reimbursements`}
            className="text-sm underline"
          >
            {reimbursements.length} payment(s) outstanding →
          </Link>
        ) : (
          <p className="text-sm opacity-60">All settled.</p>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Missing receipts ({missingReceipts})</h2>
        {missingReceipts > 0 ? (
          <Link href={`/${slug}/purchases?status=logged`} className="text-sm underline">
            {missingReceipts} logged purchase(s) need receipts →
          </Link>
        ) : (
          <p className="text-sm opacity-60">Receipts complete.</p>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">Recent activity</h2>
        <ul className="grid gap-1 text-sm">
          {activity.map((a) => (
            <li key={a.id} className="opacity-80">
              <span className="opacity-60">
                {a.createdAt.toLocaleString()} · {actorName(a.actorId)}
              </span>{" "}
              {a.action}{" "}
              <span className="opacity-60">
                {a.entity} {a.entityId.slice(0, 8)}
              </span>
            </li>
          ))}
          {activity.length === 0 && (
            <p className="text-sm opacity-60">No activity yet.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
