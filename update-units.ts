import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function extractUnitsPerPack(name: string): number | undefined {
  const m = name.match(/(?:№|N|#)\s*(\d{1,4})/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 1000 ? n : undefined;
}

async function main() {
  console.log('Starting migration...');
  const products = await prisma.product.findMany({
    where: { unitsPerPack: 1 }
  });

  console.log(`Found ${products.length} products with unitsPerPack = 1`);

  let updatedCount = 0;

  for (const product of products) {
    const units = extractUnitsPerPack(product.name);
    if (units !== undefined && units > 1) {
      await prisma.product.update({
        where: { id: product.id },
        data: { unitsPerPack: units }
      });
      console.log(`Updated product: ${product.name} -> ${units} units`);
      updatedCount++;
    }
  }

  console.log(`Finished! Updated ${updatedCount} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
