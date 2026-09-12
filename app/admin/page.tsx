import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser, isAdminEmail } from "@/lib/roles";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) redirect("/");

  const [orgs, users, memberships, auditCount] = await Promise.all([
    db.org.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { memberships: true, proposals: true } } },
    }),
    db.user.count(),
    db.membership.count(),
    db.auditLog.count(),
  ]);

  const flags = [
    ["GITHUB_CLIENT_ID", !!process.env.GITHUB_CLIENT_ID],
    ["GOOGLE_CLIENT_ID", !!process.env.GOOGLE_CLIENT_ID],
    ["SMTP_HOST", !!process.env.SMTP_HOST],
    ["ADMIN_EMAILS", !!process.env.ADMIN_EMAILS],
    ["UPLOAD_DIR", !!process.env.UPLOAD_DIR],
  ] as const;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-bold">Admin</h1>
      <p className="mt-1 text-sm opacity-60">
        {orgs.length} orgs · {users} users · {memberships} memberships ·{" "}
        {auditCount} audit rows
      </p>

      <h2 className="mb-2 mt-6 font-semibold">Orgs</h2>
      <ul className="grid gap-2">
        {orgs.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap gap-2 rounded-lg border p-3 text-sm"
          >
            <a href={`/${o.slug}`} className="font-medium hover:underline">
              {o.name}
            </a>
            <span className="opacity-60">
              /{o.slug} · {o.currency} · {o._count.memberships} members ·{" "}
              {o._count.proposals} proposals
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 mt-6 font-semibold">Config flags</h2>
      <ul className="grid gap-1 text-sm">
        {flags.map(([k, v]) => (
          <li key={k}>
            <span
              className={`mr-2 inline-block h-2 w-2 rounded-full ${v ? "bg-green-500" : "bg-red-500"}`}
            />
            {k} {v ? "set" : "missing"}
          </li>
        ))}
      </ul>
    </main>
  );
}
