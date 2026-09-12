const COLORS: Record<string, string> = {
  draft: "opacity-60",
  submitted: "border-blue-500/50 text-blue-500",
  approved: "border-green-500/50 text-green-500",
  denied: "border-red-500/50 text-red-500",
  changes_requested: "border-yellow-500/50 text-yellow-600",
  completed: "border-green-700/50 text-green-700",
  logged: "opacity-60",
  verified: "border-green-500/50 text-green-500",
  owed: "border-yellow-500/50 text-yellow-600",
  reimbursed: "opacity-60",
  unmatched: "opacity-60",
  suggested: "border-blue-500/50 text-blue-500",
  linked: "border-green-500/50 text-green-500",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${COLORS[status] ?? ""}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
