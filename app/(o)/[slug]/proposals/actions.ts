"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { calcTotals, parseMajorToMinor } from "@/lib/money";
import { ROLE_RANK, requireAction } from "@/lib/roles";

const MAX_ROWS = 8;

const proposalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(2000).optional(),
});

type ItemInput = {
  name: string;
  qty: number;
  unitCents: number;
  taxable: boolean;
  url?: string;
};

function readItems(formData: FormData, currency: string): ItemInput[] | null {
  const items: ItemInput[] = [];
  for (let i = 0; i < MAX_ROWS; i++) {
    const name = (formData.get(`item-name-${i}`) ?? "").toString().trim();
    if (!name) continue;
    const qty = Math.floor(Number(formData.get(`item-qty-${i}`)));
    const unitCents = parseMajorToMinor(
      (formData.get(`item-unit-${i}`) ?? "").toString(),
      currency,
    );
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return null;
    if (unitCents === null) return null;
    const url = (formData.get(`item-url-${i}`) ?? "").toString().trim();
    items.push({
      name: name.slice(0, 200),
      qty,
      unitCents,
      taxable: formData.get(`item-taxable-${i}`) === "on",
      url: url ? url.slice(0, 500) : undefined,
    });
  }
  return items.length > 0 ? items : null;
}

function fail(slug: string, path: string, err: string): never {
  redirect(`/${slug}/proposals${path}?err=${encodeURIComponent(err)}`);
}

export async function createProposal(slug: string, formData: FormData) {
  const { org, user } = await requireAction(slug, "propose");
  const parsed = proposalSchema.safeParse({
    title: formData.get("title"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) fail(slug, "/new", "Title is required.");
  const items = readItems(formData, org.currency);
  if (!items) fail(slug, "/new", "Add at least one valid item.");
  const totals = calcTotals(items, org.defaultTaxRateBps);
  const proposal = await db.proposal.create({
    data: {
      orgId: org.id,
      authorId: user.id,
      title: parsed.data.title,
      reason: parsed.data.reason,
      currency: org.currency,
      ...totals,
      items: { create: items },
    },
  });
  await auditLog(org.id, user.id, "proposal.create", "Proposal", proposal.id);
  redirect(`/${slug}/proposals/${proposal.id}`);
}

export async function updateDraft(
  slug: string,
  id: string,
  formData: FormData,
) {
  const { org, user, membership } = await requireAction(slug, "propose");
  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
  });
  if (!proposal || proposal.status !== "draft") fail(slug, `/${id}`, "Not a draft.");
  if (
    proposal.authorId !== user.id &&
    ROLE_RANK[membership.role] < ROLE_RANK.admin
  ) {
    fail(slug, `/${id}`, "Only the author or an admin can edit.");
  }
  const parsed = proposalSchema.safeParse({
    title: formData.get("title"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) fail(slug, `/${id}/edit`, "Title is required.");
  const items = readItems(formData, proposal.currency);
  if (!items) fail(slug, `/${id}/edit`, "Add at least one valid item.");
  const totals = calcTotals(items, org.defaultTaxRateBps);
  await db.$transaction([
    db.proposalItem.deleteMany({ where: { proposalId: id } }),
    db.proposal.update({
      where: { id },
      data: {
        title: parsed.data.title,
        reason: parsed.data.reason,
        ...totals,
        items: { create: items },
      },
    }),
  ]);
  await auditLog(org.id, user.id, "proposal.edit", "Proposal", id);
  redirect(`/${slug}/proposals/${id}`);
}

export async function deleteDraft(slug: string, id: string) {
  const { org, user, membership } = await requireAction(slug, "propose");
  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
  });
  if (!proposal || proposal.status !== "draft") fail(slug, "", "Not a draft.");
  if (
    proposal.authorId !== user.id &&
    ROLE_RANK[membership.role] < ROLE_RANK.admin
  ) {
    fail(slug, "", "Only the author or an admin can delete.");
  }
  await db.$transaction([
    db.proposalItem.deleteMany({ where: { proposalId: id } }),
    db.comment.deleteMany({ where: { proposalId: id } }),
    db.proposal.delete({ where: { id } }),
  ]);
  await auditLog(org.id, user.id, "proposal.delete", "Proposal", id);
  redirect(`/${slug}/proposals`);
}

export async function submitProposal(slug: string, id: string) {
  const { org, user, membership } = await requireAction(slug, "propose");
  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
  });
  if (
    !proposal ||
    (proposal.status !== "draft" && proposal.status !== "changes_requested")
  ) {
    fail(slug, `/${id}`, "Cannot submit from this state.");
  }
  if (
    proposal.authorId !== user.id &&
    ROLE_RANK[membership.role] < ROLE_RANK.admin
  ) {
    fail(slug, `/${id}`, "Only the author or an admin can submit.");
  }
  await db.proposal.update({
    where: { id },
    data: { status: "submitted" },
  });
  await auditLog(org.id, user.id, "proposal.submit", "Proposal", id, {
    before: { status: proposal.status },
    after: { status: "submitted" },
  });
  revalidatePath(`/${slug}/proposals/${id}`);
}

const reviewSchema = z.object({
  decision: z.enum(["approved", "denied", "changes_requested"]),
  note: z.string().trim().max(2000).optional(),
});

export async function reviewProposal(
  slug: string,
  id: string,
  formData: FormData,
) {
  const { org, user, membership } = await requireAction(slug, "approve");
  const parsed = reviewSchema.safeParse({
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) fail(slug, `/${id}`, "Invalid decision.");
  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
  });
  if (
    !proposal ||
    (proposal.status !== "submitted" && proposal.status !== "changes_requested")
  ) {
    fail(slug, `/${id}`, "Nothing to review.");
  }
  const selfApproval =
    proposal.authorId === user.id && membership.role !== "owner";
  if (selfApproval) fail(slug, `/${id}`, "Self-approval is forbidden.");
  const override = proposal.authorId === user.id;
  await db.$transaction([
    db.proposal.update({
      where: { id },
      data: { status: parsed.data.decision },
    }),
    ...(parsed.data.note
      ? [
          db.comment.create({
            data: {
              orgId: org.id,
              proposalId: id,
              authorId: user.id,
              body: parsed.data.note,
            },
          }),
        ]
      : []),
  ]);
  await auditLog(
    org.id,
    user.id,
    override ? `proposal.${parsed.data.decision}.override` : `proposal.${parsed.data.decision}`,
    "Proposal",
    id,
    { before: { status: proposal.status }, after: { status: parsed.data.decision } },
  );
  revalidatePath(`/${slug}/proposals/${id}`);
}

export async function markComplete(slug: string, id: string) {
  const { org, user, membership } = await requireAction(slug, "propose");
  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
  });
  if (!proposal || proposal.status !== "approved") {
    fail(slug, `/${id}`, "Only approved proposals can complete.");
  }
  if (
    proposal.authorId !== user.id &&
    ROLE_RANK[membership.role] < ROLE_RANK.admin
  ) {
    fail(slug, `/${id}`, "Only the author or an admin can complete.");
  }
  await db.proposal.update({ where: { id }, data: { status: "completed" } });
  await auditLog(org.id, user.id, "proposal.complete", "Proposal", id, {
    before: { status: "approved" },
    after: { status: "completed" },
  });
  revalidatePath(`/${slug}/proposals/${id}`);
}

export async function cloneProposal(slug: string, id: string) {
  const { org, user } = await requireAction(slug, "propose");
  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
    include: { items: true },
  });
  if (!proposal) fail(slug, "", "Not found.");
  const copy = await db.proposal.create({
    data: {
      orgId: org.id,
      authorId: user.id,
      title: `${proposal.title} (copy)`,
      reason: proposal.reason,
      currency: proposal.currency,
      subtotalCents: proposal.subtotalCents,
      taxCents: proposal.taxCents,
      totalCents: proposal.totalCents,
      items: {
        create: proposal.items.map((it) => ({
          name: it.name,
          url: it.url,
          imageUrl: it.imageUrl,
          qty: it.qty,
          unitCents: it.unitCents,
          taxable: it.taxable,
          taxRateBpsOverride: it.taxRateBpsOverride,
          priceSource: it.priceSource,
        })),
      },
    },
  });
  await auditLog(org.id, user.id, "proposal.clone", "Proposal", copy.id, {
    after: { from: id },
  });
  redirect(`/${slug}/proposals/${copy.id}`);
}

export async function addProposalComment(
  slug: string,
  id: string,
  formData: FormData,
) {
  const { org, user } = await requireAction(slug, "propose");
  const body = (formData.get("body") ?? "").toString().trim().slice(0, 2000);
  if (!body) fail(slug, `/${id}`, "Comment is empty.");
  const proposal = await db.proposal.findFirst({
    where: { id, orgId: org.id },
  });
  if (!proposal) fail(slug, "", "Not found.");
  await db.comment.create({
    data: { orgId: org.id, proposalId: id, authorId: user.id, body },
  });
  await auditLog(org.id, user.id, "comment.add", "Proposal", id);
  revalidatePath(`/${slug}/proposals/${id}`);
}
