-- CreateEnum
CREATE TYPE "SaleUnit" AS ENUM ('PACK', 'PIECE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "unitsPerPack" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "unit" "SaleUnit" NOT NULL DEFAULT 'PACK';
