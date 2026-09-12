import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/roles";
import { acceptInvite } from "@/lib/invites";
import { hashToken } from "@/lib/invites";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await currentUser();

  if (!user) {
    redirect(`/signin?callbackUrl=/invite/${token}`);
  }

  const invite = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { org: true },
  });
  const valid = invite && invite.expiresAt > new Date();

  return (
    <main className="mx-auto max-w-md p-8">
      {!valid ? (
        <>
          <h1 className="text-xl font-bold">Invite invalid or expired</h1>
          <p className="mt-2 text-sm opacity-70">
            Ask an org admin for a fresh invite link.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">
            Join {invite.org.name} as {invite.role}?
          </h1>
          <p className="mt-2 text-sm opacity-70">
            Invite for {invite.email} expires{" "}
            {invite.expiresAt.toLocaleDateString()}.
          </p>
          <form
            className="mt-4"
            action={async () => {
              "use server";
              const org = await acceptInvite(token, user.id);
              redirect(org ? `/${org.slug}` : "/invite/invalid");
            }}
          >
            <button
              type="submit"
              className="rounded-md border px-4 py-2 text-sm font-medium"
            >
              Accept invite
            </button>
          </form>
        </>
      )}
    </main>
  );
}
