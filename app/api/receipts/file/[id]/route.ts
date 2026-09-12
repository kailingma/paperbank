import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { readReceiptFile } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }
  const receipt = await db.receipt.findUnique({
    where: { id },
    include: { purchase: true },
  });
  if (!receipt) return new Response("Not found", { status: 404 });
  const membership = await db.membership.findFirst({
    where: {
      orgId: receipt.purchase.orgId,
      user: { email: session.user.email },
    },
  });
  if (!membership) return new Response("Forbidden", { status: 403 });
  const file = await readReceiptFile(
    receipt.purchaseId,
    receipt.id,
    receipt.fileExt,
  );
  if (!file) return new Response("Not found", { status: 404 });
  const bytes = new Uint8Array(file.bytes);
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
