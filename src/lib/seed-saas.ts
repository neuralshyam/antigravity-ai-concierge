import { prisma } from "./prisma";

async function main() {
  console.log("Cleaning SaaS database...");
  await prisma.usageLog.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.merchant.deleteMany({});
  console.log("Database empty & clean.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
