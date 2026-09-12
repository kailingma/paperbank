import type { Prisma } from "@prisma/client";
import { db } from "./db";

export function auditLog(
  orgId: string,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  diff?: { before?: Prisma.JsonValue; after?: Prisma.JsonValue },
) {
  return db.auditLog.create({
    data: {
      orgId,
      actorId,
      action,
      entity,
      entityId,
      diffJson: diff === undefined ? undefined : { ...diff },
    },
  });
}
