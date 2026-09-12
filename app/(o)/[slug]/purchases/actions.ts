"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseMajorToMinor } from "@/lib/money";
import { rateLimit } from "@/lib/ratelimit";
import { ROLE_RANK, requireAction } from "@/lib/roles";
import { extFor, saveReceiptFile } from "@/lib/storage";

function fail(slug: string, path: string, err: string): never {
  redirect(`/${slug}/purchases${path}?err=${encodeURIComponent(err)}`);
}

const purchaseSchema = z.object({
  merchant: z.string().trim().max(200).optional(),
  purchasedAt: z.string().min(1),
  notes: z.string().trim().max(2000).optional(),
  paidById: z.string().min(1),
  proposalId: z.string().optional(),
  isRefund: z.boolean(),
});

export async function createPurchase(slug: string, formData: FormData) {
  const { org, user } = await requireAction(slug, "propose");
  const parsed = purchaseSchema.safeParse({
    merchant: (formData.get("merchant") ?? "").toString() || undefined,
    purchasedAt: (formData.get("purchasedAt") ?? "").toString(),
    notes: (formData.get("notes") ?? "").toString() || undefined,
    paidById: (formData.get("paidById") ?? "").toString(),
    proposalId: (formData.get("proposalId") ?? "").toString() || undefined,
    isRefund: formData.get("isRefund") === "on",
  });
  if (!parsed.success) fail(slug, "/new", "Invalid purchase fields.");
  const subtotalCents = parseMajorToMinor(
    (formData.get("subtotal") ?? "").toString(),
    org.currency,
  );
  const taxCents =
    parseMajorToMinor((formData.get("tax") ?? "0").toString(), org.currency) ?? 0;
  if (subtotalCents === null) fail(slug, "/new", "Invalid amounts.");
  const paidBy = await db.membership.findUnique({
    where: { userId_orgId: { userId: parsed.data.paidById, orgId: org.id } },
  });
  if (!paidBy) fail(slug, "/new", "Payer must be an org member.");

  let proposalId: string | null = null;
  if (parsed.data.proposalId) {
    const proposal = await db.proposal.findFirst({
      where: { id: parsed.data.proposalId, orgId: org.id },
    });
    if (!proposal) fail(slug, "/new", "Proposal not found.");
    if (proposal.status !== "approved") {
      fail(slug, "/new", "Only approved proposals can be linked.");
    }
    proposalId = proposal.id;
  }
  const purchasedAt = new Date(parsed.data.purchasedAt);
  if (Number.isNaN(purchasedAt.getTime())) fail(slug, "/new", "Invalid date.");

  const purchase = await db.purchase.create({
    data: {
      orgId: org.id,
      proposalId,
      authorId: user.id,
      paidById: parsed.data.paidById,
      merchant: parsed.data.merchant,
      purchasedAt,
      currency: org.currency,
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      linkStatus: proposalId ? "linked" : "unmatched",
      isRefund: parsed.data.isRefund,
      notes: parsed.data.notes,
    },
  });
  await auditLog(org.id, user.id, "purchase.create", "Purchase", purchase.id, {
    after: { totalCents: purchase.totalCents, proposalId },
  });
  redirect(`/${slug}/purchases/${purchase.id}`);
}

async function ownOrApprover(
  slug: string,
  purchaseId: string,
  orgId: string,
  userId: string,
  role: keyof typeof ROLE_RANK,
) {
  const purchase = await db.purchase.findFirst({
    where: { id: purchaseId, orgId },
    include: { receipts: true },
  });
  if (!purchase) fail(slug, "", "Purchase not found.");
  if (purchase.authorId !== userId && ROLE_RANK[role] < ROLE_RANK.approver) {
    fail(slug, `/${purchaseId}`, "Only the author, approver, or admin.");
  }
  return purchase;
}

export async function uploadReceipt(
  slug: string,
  purchaseId: string,
  formData: FormData,
) {
  const { org, user, membership } = await requireAction(slug, "propose");
  const purchase = await ownOrApprover(
    slug,
    purchaseId,
    org.id,
    user.id,
    membership.role,
  );
  if (purchase.status === "verified") {
    fail(slug, `/${purchaseId}`, "Purchase is already verified.");
  }
  if (!rateLimit(`upload:${user.id}`, 20, 3600_000)) {
    fail(slug, `/${purchaseId}`, "Upload rate limit reached. Try later.");
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    fail(slug, `/${purchaseId}`, "Choose a file to upload.");
  }
  const ext = extFor(file.type);
  if (!ext) fail(slug, `/${purchaseId}`, "Only images and PDF allowed.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const receipt = await db.receipt.create({
    data: { purchaseId, imageUrl: "" },
  });
  try {
    await saveReceiptFile(purchaseId, receipt.id, file.type, bytes);
  } catch {
    await db.receipt.delete({ where: { id: receipt.id } });
    fail(slug, `/${purchaseId}`, "File too large (10MB max).");
  }
  await db.receipt.update({
    where: { id: receipt.id },
    data: { imageUrl: `/api/receipts/file/${receipt.id}`, fileExt: ext },
  });
  await auditLog(org.id, user.id, "receipt.upload", "Receipt", receipt.id, {
    after: { purchaseId },
  });
  revalidatePath(`/${slug}/purchases/${purchaseId}`);
}

export async function setReceiptAmounts(
  slug: string,
  receiptId: string,
  formData: FormData,
) {
  const { org, user, membership } = await requireAction(slug, "propose");
  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, purchase: { orgId: org.id } },
    include: { purchase: true },
  });
  if (!receipt) fail(slug, "", "Receipt not found.");
  await ownOrApprover(
    slug,
    receipt.purchaseId,
    org.id,
    user.id,
    membership.role,
  );
  const subtotalCents = parseMajorToMinor(
    (formData.get("subtotal") ?? "").toString(),
    org.currency,
  );
  const taxCents =
    parseMajorToMinor((formData.get("tax") ?? "0").toString(), org.currency) ?? 0;
  if (subtotalCents === null) {
    fail(slug, `/${receipt.purchaseId}`, "Invalid amounts.");
  }
  const merchant = (formData.get("merchant") ?? "").toString().trim();
  await db.receipt.update({
    where: { id: receiptId },
    data: {
      merchant: merchant ? merchant.slice(0, 200) : null,
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
    },
  });
  await auditLog(org.id, user.id, "receipt.edit", "Receipt", receiptId);
  revalidatePath(`/${slug}/purchases/${receipt.purchaseId}`);
}

export async function verifyReceipt(
  slug: string,
  receiptId: string,
  formData: FormData,
) {
  const { org, user, membership } = await requireAction(slug, "verify");
  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, purchase: { orgId: org.id } },
    include: { purchase: { include: { receipts: true } } },
  });
  if (!receipt) fail(slug, "", "Receipt not found.");
  if (receipt.purchase.status === "verified") {
    fail(slug, `/${receipt.purchaseId}`, "Purchase is already verified.");
  }
  const isAuthor = receipt.purchase.authorId === user.id;
  const isAdmin = ROLE_RANK[membership.role] >= ROLE_RANK.admin;
  if (isAuthor && !isAdmin) {
    fail(slug, `/${receipt.purchaseId}`, "Uploader cannot verify own receipt.");
  }
  const override = isAuthor && isAdmin;
  const verifiedTotalCents = parseMajorToMinor(
    (formData.get("verifiedTotal") ?? "").toString(),
    org.currency,
  );
  if (verifiedTotalCents === null) {
    fail(slug, `/${receipt.purchaseId}`, "Invalid verified total.");
  }
  await db.receipt.update({
    where: { id: receiptId },
    data: {
      verifiedTotalCents,
      verifiedById: user.id,
      verifiedAt: new Date(),
      ocrStatus: "verified",
    },
  });
  await auditLog(
    org.id,
    user.id,
    override ? "receipt.verify.override" : "receipt.verify",
    "Receipt",
    receiptId,
    { after: { verifiedTotalCents } },
  );

  const fresh = await db.purchase.findUnique({
    where: { id: receipt.purchaseId },
    include: { receipts: true },
  });
  if (!fresh) fail(slug, "", "Purchase not found.");
  const verified = fresh.receipts.filter((r) => r.verifiedTotalCents !== null);
  const sum = verified.reduce((s, r) => s + (r.verifiedTotalCents ?? 0), 0);
  if (verified.length >= 1 && Math.abs(sum - fresh.totalCents) <= 1) {
    await db.$transaction([
      db.purchase.update({
        where: { id: fresh.id },
        data: { status: "verified" },
      }),
      db.reimbursement.upsert({
        where: { purchaseId: fresh.id },
        update: {},
        create: {
          orgId: org.id,
          purchaseId: fresh.id,
          payeeId: fresh.paidById,
          amountCents: fresh.totalCents,
          currency: fresh.currency,
        },
      }),
    ]);
    await auditLog(org.id, user.id, "purchase.verify", "Purchase", fresh.id);
    await auditLog(org.id, user.id, "reimbursement.create", "Purchase", fresh.id, {
      after: { amountCents: fresh.totalCents, payeeId: fresh.paidById },
    });
    if (fresh.proposalId) {
      const proposal = await db.proposal.findUnique({
        where: { id: fresh.proposalId },
      });
      if (proposal && proposal.status === "approved") {
        const linked = await db.purchase.findMany({
          where: { proposalId: proposal.id, status: "verified" },
        });
        const spent = linked.reduce((s, p) => s + p.totalCents, 0);
        if (spent >= proposal.totalCents) {
          await db.proposal.update({
            where: { id: proposal.id },
            data: { status: "completed" },
          });
          await auditLog(org.id, user.id, "proposal.complete.auto", "Proposal", proposal.id, {
            before: { status: "approved" },
            after: { status: "completed" },
          });
        }
      }
    }
  }
  revalidatePath(`/${slug}/purchases/${fresh.id}`);
}

export async function linkPurchase(
  slug: string,
  purchaseId: string,
  formData: FormData,
) {
  const { org, user } = await requireAction(slug, "verify");
  const purchase = await db.purchase.findFirst({
    where: { id: purchaseId, orgId: org.id },
  });
  if (!purchase) fail(slug, "", "Purchase not found.");
  const raw = (formData.get("proposalId") ?? "").toString();
  if (!raw) {
    await db.purchase.update({
      where: { id: purchaseId },
      data: { proposalId: null, linkStatus: "unmatched" },
    });
    await auditLog(org.id, user.id, "purchase.unlink", "Purchase", purchaseId, {
      before: { proposalId: purchase.proposalId },
    });
  } else {
    const proposal = await db.proposal.findFirst({
      where: { id: raw, orgId: org.id },
    });
    if (!proposal || proposal.status !== "approved") {
      fail(slug, `/${purchaseId}`, "Only approved proposals can be linked.");
    }
    await db.purchase.update({
      where: { id: purchaseId },
      data: { proposalId: proposal.id, linkStatus: "linked" },
    });
    await auditLog(org.id, user.id, "purchase.link", "Purchase", purchaseId, {
      before: { proposalId: purchase.proposalId },
      after: { proposalId: proposal.id },
    });
  }
  revalidatePath(`/${slug}/purchases/${purchaseId}`);
}

export async function addPurchaseComment(
  slug: string,
  id: string,
  formData: FormData,
) {
  const { org, user } = await requireAction(slug, "propose");
  const body = (formData.get("body") ?? "").toString().trim().slice(0, 2000);
  if (!body) fail(slug, `/${id}`, "Comment is empty.");
  const purchase = await db.purchase.findFirst({
    where: { id, orgId: org.id },
  });
  if (!purchase) fail(slug, "", "Not found.");
  await db.comment.create({
    data: { orgId: org.id, purchaseId: id, authorId: user.id, body },
  });
  await auditLog(org.id, user.id, "comment.add", "Purchase", id);
  revalidatePath(`/${slug}/purchases/${id}`);
}
