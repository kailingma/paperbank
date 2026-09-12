import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Home() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">PaperBank</h1>
        <p className="text-sm opacity-70">
          Collaborative spend-tracking + manual reimbursement log. No banks, no
          cards, no transfers — ledger only.
        </p>
        <Link
          href="/signin"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Sign in →
        </Link>
      </main>
    );
  }

  const memberships = await db.membership.findMany({
    where: { user: { email: session.user.email } },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 1) redirect(`/${memberships[0].org.slug}`);

  return (
    <main className="mx-auto max-w-xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your orgs</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-sm opacity-70 hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <ul className="mt-4 grid gap-3">
        {memberships.map((m) => (
          <li key={m.orgId} className="rounded-lg border p-4">
            <Link
              href={`/${m.org.slug}`}
              className="font-semibold hover:underline"
            >
              {m.org.name}
            </Link>
            <span className="ml-2 text-xs opacity-60">{m.role}</span>
          </li>
        ))}
        {memberships.length === 0 && (
          <p className="text-sm opacity-60">
            No orgs yet. Ask an admin for an invite link.
          </p>
        )}
      </ul>
    </main>
  );
}
