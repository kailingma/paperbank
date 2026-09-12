"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { createInvite } from "@/lib/invites";
import { ROLE_RANK, requireAction } from "@/lib/roles";

const inviteSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["viewer", "member", "approver", "admin", "owner"]),
});

// Admins may grant up to approver; only owners may grant admin/owner.
function grantable(actorRole: keyof typeof ROLE_RANK) {
  return actorRole === "owner"
    ? (["viewer", "member", "approver", "admin", "owner"] as const)
    : (["viewer", "member", "approver"] as const);
}

function fail(slug: string, err: string): never {
  redirect(`/${slug}/team?err=${encodeURIComponent(err)}`);
}

export async function inviteMember(slug: string, formData: FormData) {
  const { org, user, membership } = await requireAction(slug, "manageMembers");
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) fail(slug, "Invalid email or role.");
  if (
    !(grantable(membership.role) as readonly string[]).includes(parsed.data.role)
  ) {
    fail(slug, "Only owners can grant admin or owner.");
  }
  const existing = await db.membership.findFirst({
    where: { orgId: org.id, user: { email: parsed.data.email.toLowerCase() } },
  });
  if (existing) fail(slug, "That user is already a member.");
  const { invite, token } = await createInvite(org.id, parsed.data.email, parsed.data.role);
  await auditLog(org.id, user.id, "invite.create", "Invite", invite.id, {
    after: { email: invite.email, role: invite.role },
  });
  revalidatePath(`/${slug}/team`);
  redirect(`/${slug}/team?invite=${invite.id}&t=${token}`);
}

export async function updateRole(slug: string, formData: FormData) {
  const { org, user, membership } = await requireAction(slug, "manageMembers");
  const parsed = inviteSchema
    .extend({ userId: z.string().min(1) })
    .safeParse({
      userId: formData.get("userId"),
      email: "x@y.zz",
      role: formData.get("role"),
    });
  if (!parsed.success) fail(slug, "Invalid role.");
  if (
    !(grantable(membership.role) as readonly string[]).includes(parsed.data.role)
  ) {
    fail(slug, "Only owners can grant admin or owner.");
  }
  const target = await db.membership.findUnique({
    where: { userId_orgId: { userId: parsed.data.userId, orgId: org.id } },
  });
  if (!target) fail(slug, "Member not found.");
  if (target.role === "owner" && membership.role !== "owner") {
    fail(slug, "Only owners can change an owner.");
  }
  if (target.userId === user.id && parsed.data.role !== target.role) {
    const owners = await db.membership.count({
      where: { orgId: org.id, role: "owner" },
    });
    if (target.role === "owner" && owners <= 1) {
      fail(slug, "Cannot demote the last owner.");
    }
  }
  await db.membership.update({
    where: { userId_orgId: { userId: target.userId, orgId: org.id } },
    data: { role: parsed.data.role },
  });
  await auditLog(org.id, user.id, "member.role", "Membership", target.userId, {
    before: { role: target.role },
    after: { role: parsed.data.role },
  });
  revalidatePath(`/${slug}/team`);
}

export async function removeMember(slug: string, formData: FormData) {
  const { org, user, membership } = await requireAction(slug, "manageMembers");
  const userId = formData.get("userId");
  if (typeof userId !== "string") fail(slug, "Invalid member.");
  const target = await db.membership.findUnique({
    where: { userId_orgId: { userId, orgId: org.id } },
  });
  if (!target) fail(slug, "Member not found.");
  if (target.role === "owner" && membership.role !== "owner") {
    fail(slug, "Only owners can remove an owner.");
  }
  if (target.role === "owner") {
    const owners = await db.membership.count({
      where: { orgId: org.id, role: "owner" },
    });
    if (owners <= 1) fail(slug, "Cannot remove the last owner.");
  }
  await db.membership.delete({
    where: { userId_orgId: { userId, orgId: org.id } },
  });
  await auditLog(org.id, user.id, "member.remove", "Membership", userId, {
    before: { role: target.role },
  });
  revalidatePath(`/${slug}/team`);
  if (userId === user.id) redirect("/");
}

export async function cancelInvite(slug: string, formData: FormData) {
  const { org, user } = await requireAction(slug, "manageMembers");
  const id = formData.get("id");
  if (typeof id !== "string") fail(slug, "Invalid invite.");
  await db.invite.deleteMany({ where: { id, orgId: org.id } });
  await auditLog(org.id, user.id, "invite.cancel", "Invite", id);
  revalidatePath(`/${slug}/team`);
}
