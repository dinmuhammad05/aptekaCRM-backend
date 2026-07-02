-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "activeIngredient" TEXT;

-- CreateIndex
CREATE INDEX "Product_pharmacyId_activeIngredient_idx" ON "Product"("pharmacyId", "activeIngredient");
