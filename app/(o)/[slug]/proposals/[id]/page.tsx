import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { ROLE_RANK, requireAction } from "@/lib/roles";
import {
  addProposalComment,
  cloneProposal,
  deleteDraft,
  markComplete,
  reviewProposal,
  submitProposal,
} from "../actions";

export default async function ProposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug, id } = await params;
  const { org, user, membership } = await requireAction(slug, "read");
  const query = await searchParams;

  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
    include: {
      items: true,
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!proposal) notFound();

  const authors = await db.user.findMany({
    where: {
      id: {
        in: [
          proposal.authorId,
          ...proposal.comments.map((c) => c.authorId),
        ],
      },
    },
    select: { id: true, name: true, email: true },
  });
  const nameOf = (uid: string) =>
    authors.find((a) => a.id === uid)?.name ??
    authors.find((a) => a.id === uid)?.email ??
    uid.slice(0, 8);

  const purchases = await db.purchase.findMany({
    where: { proposalId: id },
    orderBy: { createdAt: "desc" },
  });

  const rank = ROLE_RANK[membership.role];
  const isAuthor = proposal.authorId === user.id;
  const canEdit = proposal.status === "draft" && (isAuthor || rank >= ROLE_RANK.admin);
  const canSubmit =
    (proposal.status === "draft" || proposal.status === "changes_requested") &&
    (isAuthor || rank >= ROLE_RANK.admin);
  const canReview =
    (proposal.status === "submitted" ||
      proposal.status === "changes_requested") &&
    rank >= ROLE_RANK.approver;
  const canComplete =
    proposal.status === "approved" && (isAuthor || rank >= ROLE_RANK.admin);

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href={`/${slug}/proposals`}
          className="text-sm opacity-60 hover:underline"
        >
          ← Proposals
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{proposal.title}</h1>
          <StatusPill status={proposal.status} />
        </div>
        {proposal.reason && (
          <p className="mt-2 text-sm opacity-80">{proposal.reason}</p>
        )}
        <p className="mt-1 text-xs opacity-60">
          by {nameOf(proposal.authorId)}
        </p>
      </div>

      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}

      <section className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left opacity-60">
              <th className="p-2">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Unit</th>
              <th className="p-2 text-right">Line</th>
            </tr>
          </thead>
          <tbody>
            {proposal.items.map((it) => (
              <tr key={it.id} className="border-b last:border-0">
                <td className="p-2">
                  {it.url ? (
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {it.name}
                    </a>
                  ) : (
                    it.name
                  )}
                  {it.taxable && (
                    <span className="ml-1 text-xs opacity-60">+tax</span>
                  )}
                </td>
                <td className="p-2 text-right">{it.qty}</td>
                <td className="p-2 text-right">
                  {formatCents(it.unitCents, proposal.currency)}
                </td>
                <td className="p-2 text-right">
                  {formatCents(it.qty * it.unitCents, proposal.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-medium">
            <tr>
              <td colSpan={3} className="p-2 text-right opacity-60">
                Subtotal
              </td>
              <td className="p-2 text-right">
                {formatCents(proposal.subtotalCents, proposal.currency)}
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="p-2 text-right opacity-60">
                Tax
              </td>
              <td className="p-2 text-right">
                {formatCents(proposal.taxCents, proposal.currency)}
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="p-2 text-right">
                Total
              </td>
              <td className="p-2 text-right font-bold">
                {formatCents(proposal.totalCents, proposal.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="flex flex-wrap gap-2">
        {canEdit && (
          <Link
            href={`/${slug}/proposals/${id}/edit`}
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            Edit draft
          </Link>
        )}
        {canSubmit && (
          <form action={submitProposal.bind(null, slug, id)}>
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm font-medium"
            >
              Submit for approval
            </button>
          </form>
        )}
        {canEdit && (
          <form action={deleteDraft.bind(null, slug, id)}>
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm text-red-500"
            >
              Delete draft
            </button>
          </form>
        )}
        {canComplete && (
          <form action={markComplete.bind(null, slug, id)}>
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm font-medium"
            >
              Mark complete
            </button>
          </form>
        )}
        {(proposal.status === "denied" || proposal.status === "completed") && (
          <form action={cloneProposal.bind(null, slug, id)}>
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Clone to new draft
            </button>
          </form>
        )}
      </section>

      {canReview && (
        <section className="rounded-lg border p-3">
          <h2 className="mb-2 font-semibold">Review</h2>
          {isAuthor && (
            <p className="mb-2 text-xs text-yellow-600">
              You authored this — only an owner override can approve your own
              proposal.
            </p>
          )}
          <form
            action={reviewProposal.bind(null, slug, id)}
            className="grid gap-2"
          >
            <textarea
              name="note"
              rows={2}
              maxLength={2000}
              placeholder="Note (optional, posted as comment)"
              className="rounded-md border bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="decision"
                value="approved"
                className="rounded-md border border-green-500/50 px-3 py-1.5 text-sm text-green-600"
              >
                Approve
              </button>
              <button
                type="submit"
                name="decision"
                value="changes_requested"
                className="rounded-md border border-yellow-500/50 px-3 py-1.5 text-sm text-yellow-600"
              >
                Request changes
              </button>
              <button
                type="submit"
                name="decision"
                value="denied"
                className="rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-500"
              >
                Deny
              </button>
            </div>
          </form>
        </section>
      )}

      {purchases.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Linked purchases</h2>
          <ul className="grid gap-2">
            {purchases.map((pu) => {
              const variance = pu.totalCents - proposal.totalCents;
              return (
                <li
                  key={pu.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
                >
                  <Link
                    href={`/${slug}/purchases/${pu.id}`}
                    className="hover:underline"
                  >
                    {pu.merchant ?? "Purchase"}
                  </Link>
                  <StatusPill status={pu.status} />
                  <span
                    className={`ml-auto font-medium ${variance > 0 ? "text-red-500" : variance < 0 ? "text-green-600" : ""}`}
                  >
                    {variance === 0
                      ? "on budget"
                      : `${variance > 0 ? "over" : "under"} by ${formatCents(Math.abs(variance), pu.currency)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">
          Comments ({proposal.comments.length})
        </h2>
        <ul className="grid gap-2">
          {proposal.comments.map((c) => (
            <li key={c.id} className="rounded-lg border p-3 text-sm">
              <p className="mb-1 text-xs opacity-60">
                {nameOf(c.authorId)} · {c.createdAt.toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
        <form
          action={addProposalComment.bind(null, slug, id)}
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
