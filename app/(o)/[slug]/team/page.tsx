import { db } from "@/lib/db";
import { ROLE_RANK, requireAction } from "@/lib/roles";
import {
  cancelInvite,
  inviteMember,
  removeMember,
  updateRole,
} from "./actions";

const ORDER = ["owner", "admin", "approver", "member", "viewer"] as const;

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string; invite?: string; t?: string }>;
}) {
  const { slug } = await params;
  const { org, membership } = await requireAction(slug, "read");
  const query = await searchParams;
  const canManage = ROLE_RANK[membership.role] >= ROLE_RANK.admin;

  const members = await db.membership.findMany({
    where: { orgId: org.id },
    include: { user: true },
  });
  members.sort(
    (a, b) =>
      ORDER.indexOf(a.role) - ORDER.indexOf(b.role) ||
      a.user.email.localeCompare(b.user.email),
  );
  const invites = canManage
    ? await db.invite.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const justCreated =
    query.invite && query.t
      ? invites.find((i) => i.id === query.invite)
      : null;

  const roleOptions =
    membership.role === "owner"
      ? (["viewer", "member", "approver", "admin", "owner"] as const)
      : (["viewer", "member", "approver"] as const);

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-bold">Team</h1>
      {query.err && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {query.err}
        </p>
      )}
      {justCreated && query.t && (
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">
            Invite created — share this link (shown once):
          </p>
          <p className="mt-1 break-all font-mono text-xs">/invite/{query.t}</p>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold">
          Members ({members.length})
        </h2>
        <ul className="grid gap-2">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
            >
              <span className="font-medium">{m.user.name ?? m.user.email}</span>
              <span className="opacity-60">{m.user.email}</span>
              {canManage ? (
                <form
                  action={updateRole.bind(null, slug)}
                  className="ml-auto flex gap-2"
                >
                  <input type="hidden" name="userId" value={m.userId} />
                  <select
                    name="role"
                    defaultValue={m.role}
                    className="rounded border bg-transparent px-2 py-1 text-sm"
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded border px-2 py-1 text-xs"
                  >
                    Set
                  </button>
                </form>
              ) : (
                <span className="ml-auto rounded-full border px-2 py-0.5 text-xs">
                  {m.role}
                </span>
              )}
              {canManage && (
                <form action={removeMember.bind(null, slug)}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <button
                    type="submit"
                    className="rounded border px-2 py-1 text-xs text-red-500"
                  >
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <>
          <section>
            <h2 className="mb-2 font-semibold">Invite member</h2>
            <form
              action={inviteMember.bind(null, slug)}
              className="flex flex-wrap gap-2"
            >
              <input
                name="email"
                type="email"
                required
                placeholder="teammate@example.com"
                className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
              />
              <select
                name="role"
                defaultValue="member"
                className="rounded-md border bg-transparent px-2 py-2 text-sm"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md border px-4 py-2 text-sm font-medium"
              >
                Invite
              </button>
            </form>
          </section>

          {invites.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Pending invites</h2>
              <ul className="grid gap-2">
                {invites.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                  >
                    <span>{i.email}</span>
                    <span className="opacity-60">
                      {i.role} · expires{" "}
                      {i.expiresAt.toLocaleDateString()}
                    </span>
                    <form
                      action={cancelInvite.bind(null, slug)}
                      className="ml-auto"
                    >
                      <input type="hidden" name="id" value={i.id} />
                      <button
                        type="submit"
                        className="rounded border px-2 py-1 text-xs"
                      >
                        Cancel
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
