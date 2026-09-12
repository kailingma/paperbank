import { createHash, randomBytes } from "crypto";
import { db } from "./db";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvite(
  orgId: string,
  email: string,
  role: "viewer" | "member" | "approver" | "admin" | "owner",
) {
  const token = randomBytes(32).toString("hex");
  const invite = await db.invite.create({
    data: {
      orgId,
      email: email.toLowerCase(),
      role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  return { invite, token };
}

export async function acceptInvite(token: string, userId: string) {
  const invite = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { org: true },
  });
  if (!invite || invite.expiresAt < new Date()) return null;
  await db.$transaction([
    db.membership.upsert({
      where: { userId_orgId: { userId, orgId: invite.orgId } },
      update: {},
      create: { userId, orgId: invite.orgId, role: invite.role },
    }),
    db.invite.delete({ where: { id: invite.id } }),
  ]);
  return invite.org;
}
