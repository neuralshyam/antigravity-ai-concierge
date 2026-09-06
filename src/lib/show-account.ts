import { prisma } from "./prisma";

async function main() {
  const merchants = await prisma.merchant.findMany({
    include: { stores: true },
  });
  console.log(JSON.stringify(merchants, null, 2));
}

main().finally(async () => {
  await prisma.$disconnect();
});
