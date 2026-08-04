const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const batches = await prisma.batch.findMany({
    take: 50,
    orderBy: { receivedAt: 'desc' },
    include: { product: true }
  });
  console.log(batches.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
