import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { currencyDecimals, formatCents } from "@/lib/money";
import { ROLE_RANK, requireAction } from "@/lib/roles";
import {
  addPurchaseComment,
  linkPurchase,
  setReceiptAmounts,
  uploadReceipt,
  verifyReceipt,
} from "../actions";

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug, id } = await params;
  const { org, user, membership } = await requireAction(slug, "read");
  const query = await searchParams;

  const purchase = await db.purchase.findFirst({
    where: { id, orgId: org.id },
    include: {
      receipts: { orderBy: { createdAt: "asc" } },
      reimbursement: true,
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!purchase) notFound();

  const users = await db.user.findMany({
    where: {
      id: {
        in: [
          purchase.authorId,
          purchase.paidById,
          ...purchase.comments.map((c) => c.authorId),
        ],
      },
    },
    select: { id: true, name: true, email: true },
  });
  const nameOf = (uid: string) =>
    users.find((u) => u.id === uid)?.name ??
    users.find((u) => u.id === uid)?.email ??
    uid.slice(0, 8);

  const proposal = purchase.proposalId
    ? await db.proposal.findUnique({ where: { id: purchase.proposalId } })
    : null;
  const approved = await db.proposal.findMany({
    where: { orgId: org.id, status: "approved" },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const rank = ROLE_RANK[membership.role];
  const canEdit =
    purchase.authorId === user.id || rank >= ROLE_RANK.approver;
  const canVerify = rank >= ROLE_RANK.approver;
  const d = 10 ** currencyDecimals(purchase.currency);
  const variance = proposal ? purchase.totalCents - proposal.totalCents : null;

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href={`/${slug}/purchases`}
          className="text-sm opacity-60 hover:underline"
        >
          ← Purchases
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">
            {purchase.merchant ?? "Purchase"}
          </h1>
          <StatusPill status={purchase.status} />
          <StatusPill status={purchase.linkStatus} />
        </div>
        <p className="mt-1 text-sm opacity-70">
          {formatCents(purchase.totalCents, purchase.currency)} · paid by{" "}
          {nameOf(purchase.paidById)} ·{" "}
          {purchase.purchasedAt.toLocaleDateString()}
          {purchase.isRefund ? " · refund" : ""}
        </p>
        {purchase.notes && (
          <p className="mt-2 text-sm opacity-80">{purchase.notes}</p>
        )}
      </div>

      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}

      <section className="rounded-lg border p-3">
        <h2 className="mb-2 font-semibold">Proposal link</h2>
        {proposal ? (
          <p className="text-sm">
            <Link
              href={`/${slug}/proposals/${proposal.id}`}
              className="hover:underline"
            >
              {proposal.title}
            </Link>{" "}
            {variance !== null && (
              <span
                className={`ml-1 font-medium ${variance > 0 ? "text-red-500" : variance < 0 ? "text-green-600" : ""}`}
              >
                {variance === 0
                  ? "(on budget)"
                  : `${variance > 0 ? "over" : "under"} by ${formatCents(Math.abs(variance), purchase.currency)}`}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm opacity-60">Standalone (no proposal).</p>
        )}
        {canVerify && (
          <form
            action={linkPurchase.bind(null, slug, id)}
            className="mt-2 flex gap-2"
          >
            <select
              name="proposalId"
              defaultValue={purchase.proposalId ?? ""}
              className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1.5 text-sm"
            >
              <option value="">Unlink (standalone)</option>
              {approved.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Set
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">
          Receipts ({purchase.receipts.length})
        </h2>
        <ul className="grid gap-3">
          {purchase.receipts.map((r) => (
            <li key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={r.imageUrl || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {r.merchant ?? "Receipt"}
                </a>
                <StatusPill status={r.ocrStatus} />
                <span className="ml-auto font-medium">
                  {r.verifiedTotalCents !== null
                    ? formatCents(r.verifiedTotalCents, purchase.currency)
                    : r.totalCents !== null
                      ? formatCents(r.totalCents, purchase.currency)
                      : "no total"}
                </span>
              </div>
              {canEdit && r.verifiedTotalCents === null && (
                <form
                  action={setReceiptAmounts.bind(null, slug, r.id)}
                  className="mt-2 flex flex-wrap gap-2"
                >
                  <input
                    name="merchant"
                    placeholder="Merchant"
                    defaultValue={r.merchant ?? ""}
                    className="w-32 rounded border bg-transparent px-2 py-1 text-sm"
                  />
                  <input
                    name="subtotal"
                    placeholder="Subtotal"
                    inputMode="decimal"
                    defaultValue={
                      r.subtotalCents !== null
                        ? String(r.subtotalCents / d)
                        : ""
                    }
                    className="w-24 rounded border bg-transparent px-2 py-1 text-sm"
                  />
                  <input
                    name="tax"
                    placeholder="Tax"
                    inputMode="decimal"
                    defaultValue={
                      r.taxCents !== null ? String(r.taxCents / d) : "0"
                    }
                    className="w-24 rounded border bg-transparent px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded border px-2 py-1 text-xs"
                  >
                    Save
                  </button>
                </form>
              )}
              {canVerify &&
                purchase.status === "logged" &&
                r.verifiedTotalCents === null && (
                  <form
                    action={verifyReceipt.bind(null, slug, r.id)}
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <input
                      name="verifiedTotal"
                      required
                      placeholder="Verified total"
                      inputMode="decimal"
                      defaultValue={
                        r.totalCents !== null
                          ? String(r.totalCents / d)
                          : ""
                      }
                      className="w-32 rounded border bg-transparent px-2 py-1 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded border border-green-500/50 px-2 py-1 text-xs text-green-600"
                    >
                      Verify
                    </button>
                    {purchase.authorId === user.id && (
                      <span className="text-xs text-yellow-600">
                        admin override (you logged this)
                      </span>
                    )}
                  </form>
                )}
              {r.verifiedTotalCents !== null && (
                <p className="mt-1 text-xs opacity-60">
                  verified{ r.verifiedAt ? ` ${r.verifiedAt.toLocaleString()}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
        {canEdit && purchase.status === "logged" && (
          <form
            action={uploadReceipt.bind(null, slug, id)}
            className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border p-3"
          >
            <input
              name="file"
              type="file"
              required
              accept="image/*,application/pdf"
              className="min-w-0 flex-1 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Upload receipt
            </button>
          </form>
        )}
      </section>

      {purchase.reimbursement && (
        <section className="rounded-lg border p-3 text-sm">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Reimbursement</h2>
            <StatusPill status={purchase.reimbursement.status} />
            <span className="ml-auto font-semibold">
              {formatCents(
                purchase.reimbursement.amountCents,
                purchase.reimbursement.currency,
              )}{" "}
              → {nameOf(purchase.reimbursement.payeeId)}
            </span>
          </div>
          {purchase.reimbursement.status === "reimbursed" && (
            <p className="mt-1 text-xs opacity-60">
              {purchase.reimbursement.paidViaNote ?? "paid"}
              {purchase.reimbursement.markedPaidAt
                ? ` · ${purchase.reimbursement.markedPaidAt.toLocaleString()}`
                : ""}
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">
          Comments ({purchase.comments.length})
        </h2>
        <ul className="grid gap-2">
          {purchase.comments.map((c) => (
            <li key={c.id} className="rounded-lg border p-3 text-sm">
              <p className="mb-1 text-xs opacity-60">
                {nameOf(c.authorId)} · {c.createdAt.toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
        <form
          action={addPurchaseComment.bind(null, slug, id)}
          className="mt-2 flex gap-2"
        >
          <input
            name="body"
            required
            maxLength={2000}
            placeholder="Add a comment…"
            className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border px-3 py-2 text-sm"
          >
            Post
          </button>
        </form>
      </section>
    </div>
  );
}
