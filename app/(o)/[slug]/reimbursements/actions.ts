"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireAction } from "@/lib/roles";

const paidSchema = z.object({
  via: z.enum(["cash", "venmo", "zelle", "other"]),
  note: z.string().trim().max(200).optional(),
});

export async function markPaid(
  slug: string,
  id: string,
  formData: FormData,
) {
  const { org, user } = await requireAction(slug, "manageMoney");
  const parsed = paidSchema.safeParse({
    via: formData.get("via"),
    note: (formData.get("note") ?? "").toString() || undefined,
  });
  if (!parsed.success) {
    redirect(`/${slug}/reimbursements?err=${encodeURIComponent("Invalid payment info.")}`);
  }
  const reimbursement = await db.reimbursement.findFirst({
    where: { id, orgId: org.id },
  });
  if (!reimbursement) {
    redirect(`/${slug}/reimbursements?err=${encodeURIComponent("Not found.")}`);
  }
  if (reimbursement.status === "reimbursed") {
    redirect(`/${slug}/reimbursements`);
  }
  const paidViaNote = parsed.data.note
    ? `${parsed.data.via}: ${parsed.data.note}`
    : parsed.data.via;
  await db.reimbursement.update({
    where: { id },
    data: {
      status: "reimbursed",
      paidViaNote,
      markedPaidById: user.id,
      markedPaidAt: new Date(),
    },
  });
  await auditLog(org.id, user.id, "reimbursement.paid", "Reimbursement", id, {
    before: { status: "owed" },
    after: { status: "reimbursed", paidViaNote },
  });
  revalidatePath(`/${slug}/reimbursements`);
}
