-- CreateTable
CREATE TABLE "Packet" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Packet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PacketItem" (
    "id" SERIAL NOT NULL,
    "packetId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "manufacturer" TEXT,
    "form" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'dona',
    "unitsPerPack" INTEGER NOT NULL DEFAULT 1,
    "defaultCostPrice" DECIMAL(12,2),
    "sellPrice" DECIMAL(12,2),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PacketItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PacketItem_packetId_idx" ON "PacketItem"("packetId");

-- AddForeignKey
ALTER TABLE "PacketItem" ADD CONSTRAINT "PacketItem_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "Packet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
