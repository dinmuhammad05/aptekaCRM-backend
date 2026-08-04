import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const updatedNames = [
  "Лабтарен тб № 20 Laborate",
  "Небулайзер комроессорный модел CN 02MY",
  "Новоцинк  сироп 150мл (ZN20мг-Вит С40мг)",
  "Небиволол тб 5мг №28 (Ozon Россия)",
  "Троксерутин капс 300мг №50",
  "Дигоксин тб 0.25мг №40",
  "Клопидогрел тб 75мг №30",
  "Окситоцин амп. 5МЕ-м 1мл №10",
  "Пилорекс нео №42 тб(7х6",
  "Магне В6 тб 100мг/0.22мг №5",
  "Спекпон тб 50мг-20мг №20",
  "Фамотидин тб 0.02г №2",
  "Парацетамол500г №10 авантика",
  "Твеск тб 500м №10",
  "Телмиста АМ тб 40мг/5м №28",
  "Кетотифен тб 1м №30",
  "Глицерин (Глицелайт) св рект 4м №10"
];

async function main() {
  console.log('Reverting products...');
  let revertedCount = 0;
  for (const name of updatedNames) {
    const products = await prisma.product.findMany({ where: { name } });
    for (const product of products) {
      await prisma.product.update({
        where: { id: product.id },
        data: { unitsPerPack: 1 }
      });
      console.log(`Reverted: ${product.name}`);
      revertedCount++;
    }
  }
  console.log(`Finished! Reverted ${revertedCount} products.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
