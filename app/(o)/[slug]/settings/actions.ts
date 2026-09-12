"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAction } from "@/lib/roles";

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultTaxRateBps: z.coerce.number().int().min(0).max(10000),
  currency: z.string().trim().length(3).toUpperCase(),
});

export async function updateSettings(slug: string, formData: FormData) {
  const { org, user } = await requireAction(slug, "manageMoney");
  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    defaultTaxRateBps: formData.get("defaultTaxRateBps"),
    currency: formData.get("currency"),
  });
  if (!parsed.success) {
    redirect(`/${slug}/settings?err=${encodeURIComponent("Invalid settings.")}`);
  }
  if (parsed.data.currency !== org.currency) {
    const count = await db.purchase.count({ where: { orgId: org.id } });
    if (count > 0) {
      redirect(
        `/${slug}/settings?err=${encodeURIComponent("Currency is locked after the first purchase.")}`,
      );
    }
  }
  await db.org.update({
    where: { id: org.id },
    data: {
      name: parsed.data.name,
      defaultTaxRateBps: parsed.data.defaultTaxRateBps,
      currency: parsed.data.currency,
    },
  });
  await auditLog(org.id, user.id, "org.settings", "Org", org.id, {
    before: {
      name: org.name,
      defaultTaxRateBps: org.defaultTaxRateBps,
      currency: org.currency,
    },
    after: parsed.data,
  });
  revalidatePath(`/${slug}/settings`);
}

export async function deleteOrg(slug: string) {
  const { org } = await requireAction(slug, "own");
  const purchaseIds = (
    await db.purchase.findMany({
      where: { orgId: org.id },
      select: { id: true },
    })
  ).map((p) => p.id);
  const proposalIds = (
    await db.proposal.findMany({
      where: { orgId: org.id },
      select: { id: true },
    })
  ).map((p) => p.id);
  await db.$transaction([
    db.auditLog.deleteMany({ where: { orgId: org.id } }),
    db.comment.deleteMany({ where: { orgId: org.id } }),
    db.invite.deleteMany({ where: { orgId: org.id } }),
    db.reimbursement.deleteMany({ where: { orgId: org.id } }),
    db.receipt.deleteMany({ where: { purchaseId: { in: purchaseIds } } }),
    db.purchase.deleteMany({ where: { orgId: org.id } }),
    db.proposalItem.deleteMany({ where: { proposalId: { in: proposalIds } } }),
    db.proposal.deleteMany({ where: { orgId: org.id } }),
    db.membership.deleteMany({ where: { orgId: org.id } }),
    db.org.delete({ where: { id: org.id } }),
  ]);
  redirect("/");
}
