import { ProposalForm } from "@/components/ProposalForm";
import { requireAction } from "@/lib/roles";
import { createProposal } from "../actions";

export default async function NewProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug } = await params;
  const { org } = await requireAction(slug, "propose");
  const query = await searchParams;

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold">New proposal · {org.currency}</h1>
      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}
      <ProposalForm
        action={createProposal.bind(null, slug)}
        currency={org.currency}
        defaults={{ title: "", reason: "", items: [] }}
        submitLabel="Create draft"
      />
    </div>
  );
}
