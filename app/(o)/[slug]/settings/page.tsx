import { db } from "@/lib/db";
import { ROLE_RANK, requireAction } from "@/lib/roles";
import { deleteOrg, updateSettings } from "./actions";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug } = await params;
  const { org, membership } = await requireAction(slug, "read");
  const query = await searchParams;
  const canManage = ROLE_RANK[membership.role] >= ROLE_RANK.admin;
  const isOwner = membership.role === "owner";
  const purchaseCount = await db.purchase.count({
    where: { orgId: org.id },
  });

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-bold">Settings</h1>
      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}
      {canManage ? (
        <form
          action={updateSettings.bind(null, slug)}
          className="grid max-w-md gap-3"
        >
          <label className="grid gap-1 text-sm">
            Org name
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={org.name}
              className="rounded-md border bg-transparent px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Default tax rate (basis points — 887 = 8.87%)
            <input
              name="defaultTaxRateBps"
              type="number"
              min={0}
              max={10000}
              required
              defaultValue={org.defaultTaxRateBps}
              className="rounded-md border bg-transparent px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Currency {purchaseCount > 0 ? "(locked — purchases exist)" : "(3-letter code)"}
            <input
              name="currency"
              required
              minLength={3}
              maxLength={3}
              defaultValue={org.currency}
              disabled={purchaseCount > 0}
              className="rounded-md border bg-transparent px-3 py-2 uppercase disabled:opacity-50"
            />
          </label>
          <button
            type="submit"
            className="w-fit rounded-md border px-4 py-2 text-sm font-medium"
          >
            Save settings
          </button>
        </form>
      ) : (
        <dl className="grid max-w-md gap-2 text-sm">
          <div className="flex justify-between border-b py-1">
            <dt className="opacity-60">Name</dt>
            <dd>{org.name}</dd>
          </div>
          <div className="flex justify-between border-b py-1">
            <dt className="opacity-60">Currency</dt>
            <dd>{org.currency}</dd>
          </div>
          <div className="flex justify-between border-b py-1">
            <dt className="opacity-60">Default tax</dt>
            <dd>{(org.defaultTaxRateBps / 100).toFixed(2)}%</dd>
          </div>
        </dl>
      )}
      {isOwner && (
        <form action={deleteOrg.bind(null, slug)}>
          <button
            type="submit"
            className="rounded-md border border-red-500/50 px-4 py-2 text-sm text-red-500"
          >
            Delete org and all its data
          </button>
        </form>
      )}
    </div>
  );
}
