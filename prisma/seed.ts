import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Eslatma: seed oddiy PrismaClient bilan ishlaydi (tenant middleware'siz),
// shuning uchun har bir yozuvga pharmacyId QO'LDA beriladi.
const prisma = new PrismaClient();

/** Yaroqlilik muddati uchun yordamchi (bugundan N oy keyin) */
function monthsFromNow(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
}

async function main(): Promise<void> {
  // Avvalgi sinov ma'lumotlarini tozalash (bog'lanish tartibida)
  await prisma.returnItem.deleteMany();
  await prisma.return.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.pharmacy.deleteMany();

  // SaaS egasi (barcha aptekalarni boshqaradi)
  await prisma.user.create({
    data: {
      username: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
      passwordHash: await bcrypt.hash(
        process.env.SUPERADMIN_PASSWORD ?? 'superadmin123',
        10,
      ),
      name: 'Super Admin',
      role: 'SUPERADMIN',
      pharmacyId: null,
    },
  });

  // Namuna apteka (tenant) + uning admin/kassiri
  const pharmacy = await prisma.pharmacy.create({
    data: {
      name: 'Namuna Apteka',
      ownerName: 'Demo Egasi',
      phone: '+998 90 000 00 00',
      status: 'ACTIVE',
      subscriptionEndsAt: monthsFromNow(1),
    },
  });

  await prisma.user.createMany({
    data: [
      {
        pharmacyId: pharmacy.id,
        username: 'admin',
        passwordHash: await bcrypt.hash('admin123', 10),
        name: 'Apteka Admini',
        role: 'ADMIN',
      },
      {
        pharmacyId: pharmacy.id,
        username: 'kassir',
        passwordHash: await bcrypt.hash('kassir123', 10),
        name: 'Kassir',
        role: 'CASHIER',
      },
    ],
  });

  // Eslatma: batch.packs — kelgan pachka soni. Qoldiq donada saqlanadi
  // (quantity = packs × unitsPerPack). Narxlar — pachka narxlari.
  const seedData = [
    {
      name: 'Paratsetamol 500mg',
      barcode: '4780001112223',
      manufacturer: 'Farmstandart',
      form: 'tabletka',
      unit: 'dona',
      unitsPerPack: 30, // pachkada 30 tabletka
      minStock: 60,
      batches: [
        { packs: 5, costPrice: 1500, sellPrice: 2500, months: 12 },
        { packs: 3, costPrice: 1400, sellPrice: 2500, months: 3 },
      ],
    },
    {
      name: 'Analgin 500mg',
      barcode: '4780002223334',
      manufacturer: 'Nika Pharm',
      form: 'tabletka',
      unit: 'dona',
      unitsPerPack: 20, // pachkada 20 tabletka
      minStock: 40,
      batches: [{ packs: 4, costPrice: 1200, sellPrice: 2000, months: 18 }],
    },
    {
      name: 'Askorbin kislotasi',
      barcode: '4780003334445',
      manufacturer: 'Jurabek Labs',
      form: 'dragee',
      unit: 'dona',
      unitsPerPack: 10, // pachkada 10 dragee
      minStock: 50,
      batches: [{ packs: 20, costPrice: 300, sellPrice: 700, months: 24 }],
    },
    {
      name: 'Ibuprofen 200mg',
      barcode: '4780004445556',
      manufacturer: 'Remedy Group',
      form: 'kapsula',
      unit: 'dona',
      unitsPerPack: 12, // pachkada 12 kapsula
      minStock: 24,
      batches: [{ packs: 5, costPrice: 2000, sellPrice: 3500, months: 6 }],
    },
    {
      name: 'Ambroksol sirop 100ml',
      barcode: 'KP065010123380500EPL05',
      manufacturer: 'Jurabek Labs',
      form: 'sirop',
      unit: 'dona',
      unitsPerPack: 1, // sirop — faqat butun (1 dona = 1 shisha)
      minStock: 5,
      batches: [{ packs: 15, costPrice: 12000, sellPrice: 18000, months: 12 }],
    },
  ];

  for (const item of seedData) {
    const { batches, ...productData } = item;
    await prisma.product.create({
      data: {
        ...productData,
        pharmacyId: pharmacy.id,
        batches: {
          create: batches.map((b, i) => ({
            pharmacyId: pharmacy.id,
            batchNumber: `B-${productData.barcode}-${i + 1}`,
            expiryDate: monthsFromNow(b.months),
            quantity: b.packs * productData.unitsPerPack, // donada
            costPrice: b.costPrice,
            sellPrice: b.sellPrice,
          })),
        },
      },
    });
  }

  console.log('Seed muvaffaqiyatli yakunlandi.');
  console.log('  SUPERADMIN: superadmin / superadmin123');
  console.log('  Apteka admin: admin / admin123');
  console.log('  Apteka kassir: kassir / kassir123');
}

main()
  .catch((error) => {
    console.error('Seed xatosi:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
