import { notFound, redirect } from "next/navigation";
import { ProposalForm } from "@/components/ProposalForm";
import { db } from "@/lib/db";
import { currencyDecimals } from "@/lib/money";
import { ROLE_RANK, requireAction } from "@/lib/roles";
import { updateDraft } from "../../actions";

export default async function EditProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug, id } = await params;
  const { org, user, membership } = await requireAction(slug, "propose");
  const query = await searchParams;

  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
    include: { items: true },
  });
  if (!proposal || proposal.status !== "draft") notFound();
  if (
    proposal.authorId !== user.id &&
    ROLE_RANK[membership.role] < ROLE_RANK.admin
  ) {
    redirect(`/${slug}/proposals/${id}`);
  }

  const d = 10 ** currencyDecimals(proposal.currency);

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold">Edit draft</h1>
      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}
      <ProposalForm
        action={updateDraft.bind(null, slug, id)}
        currency={proposal.currency}
        defaults={{
          title: proposal.title,
          reason: proposal.reason ?? "",
          items: proposal.items.map((it) => ({
            name: it.name,
            qty: it.qty,
            unitMajor: String(it.unitCents / d),
            taxable: it.taxable,
            url: it.url ?? "",
          })),
        }}
        submitLabel="Save draft"
      />
    </div>
  );
}
