-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "paid" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "customerId" INTEGER;

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "pharmacyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "debt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "pharmacyId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_pharmacyId_idx" ON "Customer"("pharmacyId");
CREATE INDEX "Customer_pharmacyId_name_idx" ON "Customer"("pharmacyId", "name");
CREATE INDEX "CustomerPayment_pharmacyId_idx" ON "CustomerPayment"("pharmacyId");
CREATE INDEX "CustomerPayment_customerId_idx" ON "CustomerPayment"("customerId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
