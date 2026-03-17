-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('excavator', 'loader', 'bulldozer', 'crane', 'roller', 'dump_truck', 'concrete_mixer', 'generator', 'other');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'MANAGER');

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "type" "EquipmentType" NOT NULL,
    "description" TEXT NOT NULL,
    "pricePerHour" INTEGER NOT NULL,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentSpec" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,

    CONSTRAINT "EquipmentSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,

    CONSTRAINT "EquipmentImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookedPeriod" (
    "id" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "equipmentId" TEXT NOT NULL,
    "orderId" TEXT,

    CONSTRAINT "BookedPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "date" TIMESTAMP(3),
    "address" TEXT,
    "comment" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "equipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_slug_key" ON "Equipment"("slug");

-- CreateIndex
CREATE INDEX "Equipment_type_idx" ON "Equipment"("type");

-- CreateIndex
CREATE INDEX "Equipment_brand_idx" ON "Equipment"("brand");

-- CreateIndex
CREATE INDEX "Equipment_isPopular_idx" ON "Equipment"("isPopular");

-- CreateIndex
CREATE INDEX "EquipmentSpec_equipmentId_idx" ON "EquipmentSpec"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentImage_equipmentId_idx" ON "EquipmentImage"("equipmentId");

-- CreateIndex
CREATE INDEX "BookedPeriod_equipmentId_idx" ON "BookedPeriod"("equipmentId");

-- CreateIndex
CREATE INDEX "BookedPeriod_from_to_idx" ON "BookedPeriod"("from", "to");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_equipmentId_idx" ON "Order"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- AddForeignKey
ALTER TABLE "EquipmentSpec" ADD CONSTRAINT "EquipmentSpec_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentImage" ADD CONSTRAINT "EquipmentImage_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookedPeriod" ADD CONSTRAINT "BookedPeriod_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookedPeriod" ADD CONSTRAINT "BookedPeriod_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
