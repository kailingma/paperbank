import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

export const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);

export function extFor(mime: string): string | null {
  return ALLOWED.get(mime) ?? null;
}

function dir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");
}

export async function saveReceiptFile(
  purchaseId: string,
  receiptId: string,
  mime: string,
  bytes: Buffer,
): Promise<string> {
  const ext = extFor(mime);
  if (!ext) throw new Error("unsupported type");
  if (bytes.length > MAX_BYTES) throw new Error("file too large");
  let data = bytes;
  if (mime !== "application/pdf") {
    try {
      data = await sharp(bytes).rotate().toBuffer();
    } catch {
      data = bytes;
    }
  }
  const folder = join(dir(), purchaseId);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, `${receiptId}${ext}`), data);
  return ext;
}

export async function readReceiptFile(
  purchaseId: string,
  receiptId: string,
  ext: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const mime =
    [...ALLOWED.entries()].find(([, e]) => e === ext)?.[0] ??
    "application/octet-stream";
  try {
    const bytes = await readFile(join(dir(), purchaseId, `${receiptId}${ext}`));
    return { bytes: Buffer.from(bytes), mime };
  } catch {
    return null;
  }
}
