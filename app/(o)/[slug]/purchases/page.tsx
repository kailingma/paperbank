import Link from "next/link";
import type { PurchaseStatus } from "@prisma/client";
import { StatusPill } from "@/components/StatusPill";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { requireAction } from "@/lib/roles";

const FILTERS = ["all", "logged", "verified"] as const;

export default async function PurchasesPage({
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

  const purchases = await db.purchase.findMany({
    where:
      status === "all"
        ? { orgId: org.id }
        : { orgId: org.id, status: status as PurchaseStatus },
    orderBy: { purchasedAt: "desc" },
    take: 100,
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Purchases</h1>
        <Link
          href={`/${slug}/purchases/new`}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          + Log
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
            href={`/${slug}/purchases${f === "all" ? "" : `?status=${f}`}`}
            className={`rounded-full border px-3 py-1 ${status === f ? "font-semibold underline" : "opacity-60"}`}
          >
            {f}
          </Link>
        ))}
      </div>
      <ul className="grid gap-2">
        {purchases.map((p) => (
          <li key={p.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${slug}/purchases/${p.id}`}
                className="font-medium hover:underline"
              >
                {p.merchant ?? "Purchase"}
              </Link>
              <StatusPill status={p.status} />
              <StatusPill status={p.linkStatus} />
              {p.isRefund && (
                <span className="text-xs opacity-60">refund</span>
              )}
              <span className="ml-auto text-sm font-semibold">
                {formatCents(p.totalCents, p.currency)}
              </span>
            </div>
          </li>
        ))}
        {purchases.length === 0 && (
          <p className="text-sm opacity-60">No purchases.</p>
        )}
      </ul>
    </div>
  );
}
