import Link from "next/link";
import type { ProposalStatus } from "@prisma/client";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { requireAction } from "@/lib/roles";

const FILTERS = ["all", "draft", "submitted", "approved", "completed"] as const;

export default async function ProposalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; err?: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireAction(slug, "read");
  const query = await searchParams;
  const status = FILTERS.includes(query.status as (typeof FILTERS)[number])
    ? query.status
    : "all";

  const proposals = await db.proposal.findMany({
    where:
      status === "all"
        ? { orgId: org.id }
        : { orgId: org.id, status: status as ProposalStatus },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Proposals</h1>
        <Link
          href={`/${slug}/proposals/new`}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          + New
        </Link>
      </div>
      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}
      <div className="flex gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/${slug}/proposals${f === "all" ? "" : `?status=${f}`}`}
            className={`rounded-full border px-3 py-1 ${status === f ? "font-semibold underline" : "opacity-60"}`}
          >
            {f}
          </Link>
        ))}
      </div>
      <ul className="grid gap-2">
        {proposals.map((p) => (
          <li key={p.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${slug}/proposals/${p.id}`}
                className="font-medium hover:underline"
              >
                {p.title}
              </Link>
              <StatusPill status={p.status} />
              <span className="ml-auto text-sm font-semibold">
                {formatCents(p.totalCents, p.currency)}
              </span>
            </div>
          </li>
        ))}
        {proposals.length === 0 && (
          <p className="text-sm opacity-60">No proposals.</p>
        )}
      </ul>
    </div>
  );
}
