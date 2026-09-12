import Link from "next/link";
import { requireMembership } from "@/lib/roles";

const NAV = [
  { href: "", label: "Dashboard" },
  { href: "/proposals", label: "Proposals" },
  { href: "/purchases", label: "Purchases" },
  { href: "/reimbursements", label: "Reimbursements" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, membership } = await requireMembership(slug);

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <Link href={`/${slug}`} className="font-bold">
            {org.name}
          </Link>
          <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={`/${slug}${n.href}`}
                className="opacity-70 hover:opacity-100 hover:underline"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto rounded-full border px-2 py-0.5 text-xs opacity-70">
            {membership.role}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl p-4">{children}</div>
    </div>
  );
}
