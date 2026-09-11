import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.org.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo Club", slug: "demo", currency: "USD" },
  });

  for (const [email, name, role] of [
    ["owner@example.com", "Demo Owner", "owner"],
    ["member@example.com", "Demo Member", "member"],
  ] as const) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name },
    });
    await prisma.membership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      update: {},
      create: { userId: user.id, orgId: org.id, role },
    });
  }
  console.log(`seeded org ${org.slug}`);
}

main().finally(() => prisma.$disconnect());
