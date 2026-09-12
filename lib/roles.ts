import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import type { Membership, Org, User } from "@prisma/client";

export const ROLE_RANK = {
  viewer: 0,
  member: 1,
  approver: 2,
  admin: 3,
  owner: 4,
} as const;

export type Action =
  | "read"
  | "propose"
  | "approve"
  | "verify"
  | "manageMembers"
  | "manageMoney"
  | "own";

const ACTION_MIN: Record<Action, keyof typeof ROLE_RANK> = {
  read: "viewer",
  propose: "member",
  approve: "approver",
  verify: "approver",
  manageMembers: "admin",
  manageMoney: "admin",
  own: "owner",
};

export type OrgContext = { user: User; org: Org; membership: Membership };

export async function currentUser(): Promise<User | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return db.user.findUnique({ where: { email } });
}

export async function requireMembership(slug: string): Promise<OrgContext> {
  const user = await currentUser();
  if (!user) redirect(`/signin?callbackUrl=/${slug}`);
  const org = await db.org.findUnique({ where: { slug } });
  if (!org) redirect("/");
  const membership = await db.membership.findUnique({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
  });
  if (!membership) redirect("/");
  return { user, org, membership };
}

export async function requireAction(
  slug: string,
  action: Action,
): Promise<OrgContext> {
  const ctx = await requireMembership(slug);
  if (ROLE_RANK[ctx.membership.role] < ROLE_RANK[ACTION_MIN[action]]) {
    redirect(`/${slug}`);
  }
  return ctx;
}

export function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}
