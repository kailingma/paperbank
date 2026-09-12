import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

const ALL = [
  { id: "github", label: "GitHub", env: "GITHUB_CLIENT_ID" },
  { id: "google", label: "Google", env: "GOOGLE_CLIENT_ID" },
  { id: "nodemailer", label: "Email link", env: "SMTP_HOST" },
] as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; email?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl ?? "/";
  const available = ALL.filter((p) => process.env[p.env]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Sign in to PaperBank</h1>
      {available.length === 0 && (
        <p className="text-sm opacity-70">
          No auth providers configured. Set GITHUB_CLIENT_ID, GOOGLE_CLIENT_ID,
          or SMTP_HOST (see .env.example).
        </p>
      )}
      {available.map((p) => (
        <form
          key={p.id}
          action={async (formData: FormData) => {
            "use server";
            if (p.id === "nodemailer") {
              const email = formData.get("email");
              if (typeof email !== "string" || !email.includes("@")) return;
              await signIn("nodemailer", { email, redirectTo });
            } else {
              await signIn(p.id, { redirectTo });
            }
            redirect(redirectTo);
          }}
        >
          {p.id === "nodemailer" && (
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="mb-2 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            />
          )}
          <button
            type="submit"
            className="w-full rounded-md border px-4 py-2 text-sm font-medium"
          >
            Continue with {p.label}
          </button>
        </form>
      ))}
    </main>
  );
}
