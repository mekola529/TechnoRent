-- CreateEnum
CREATE TYPE "RentOrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'IN_PROGRESS', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "comment" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentOrder" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "status" "RentOrderStatus" NOT NULL DEFAULT 'NEW',
    "comment" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentOrderItem" (
    "id" TEXT NOT NULL,
    "rentOrderId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentOrderItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add rentOrderId to BookedPeriod (orderId already exists from init)
ALTER TABLE "BookedPeriod" ADD COLUMN "rentOrderId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");
CREATE INDEX "ServiceRequest_serviceType_idx" ON "ServiceRequest"("serviceType");

CREATE INDEX "RentOrder_status_idx" ON "RentOrder"("status");
CREATE INDEX "RentOrder_sourceRequestId_idx" ON "RentOrder"("sourceRequestId");

CREATE INDEX "RentOrderItem_rentOrderId_idx" ON "RentOrderItem"("rentOrderId");
CREATE INDEX "RentOrderItem_equipmentId_idx" ON "RentOrderItem"("equipmentId");

CREATE INDEX "BookedPeriod_rentOrderId_idx" ON "BookedPeriod"("rentOrderId");

-- AddForeignKey
ALTER TABLE "BookedPeriod" ADD CONSTRAINT "BookedPeriod_rentOrderId_fkey" FOREIGN KEY ("rentOrderId") REFERENCES "RentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RentOrder" ADD CONSTRAINT "RentOrder_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RentOrderItem" ADD CONSTRAINT "RentOrderItem_rentOrderId_fkey" FOREIGN KEY ("rentOrderId") REFERENCES "RentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RentOrderItem" ADD CONSTRAINT "RentOrderItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
