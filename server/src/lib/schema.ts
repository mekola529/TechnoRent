import { pool } from "./db.js";

export async function initSchema() {
  await pool.query(`
    -- Enums
    DO $$ BEGIN CREATE TYPE "OrderStatus" AS ENUM ('NEW','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "RentOrderStatus" AS ENUM ('NEW','CONFIRMED','ACTIVE','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "AdminRole" AS ENUM ('ADMIN','MANAGER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE "PricingType" AS ENUM ('fixed_from','hourly_from','calculator','tow_calculator','material_delivery_calculator','custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Equipment
    CREATE TABLE IF NOT EXISTS "Equipment" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "slug" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "brand" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "pricingType" TEXT NOT NULL DEFAULT 'hourly_from',
      "pricePerHour" INTEGER NOT NULL,
      "fuelConsumptionPer100Km" DOUBLE PRECISION,
      "fuelConsumptionPerEngineHour" DOUBLE PRECISION,
      "isPopular" BOOLEAN NOT NULL DEFAULT false,
      "baseAddress" TEXT,
      "baseLatitude" DOUBLE PRECISION,
      "baseLongitude" DOUBLE PRECISION,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Equipment_slug_key" ON "Equipment"("slug");
    CREATE INDEX IF NOT EXISTS "Equipment_type_idx" ON "Equipment"("type");
    CREATE INDEX IF NOT EXISTS "Equipment_brand_idx" ON "Equipment"("brand");
    CREATE INDEX IF NOT EXISTS "Equipment_isPopular_idx" ON "Equipment"("isPopular");
    ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "fuelConsumptionPer100Km" DOUBLE PRECISION;
    ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "fuelConsumptionPerEngineHour" DOUBLE PRECISION;

    -- EquipmentTypeCatalog
    CREATE TABLE IF NOT EXISTS "EquipmentTypeCatalog" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "value" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EquipmentTypeCatalog_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentTypeCatalog_value_key" ON "EquipmentTypeCatalog"("value");

    -- EquipmentSpec
    CREATE TABLE IF NOT EXISTS "EquipmentSpec" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "label" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "equipmentId" TEXT NOT NULL REFERENCES "Equipment"("id") ON DELETE CASCADE,
      CONSTRAINT "EquipmentSpec_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "EquipmentSpec_equipmentId_idx" ON "EquipmentSpec"("equipmentId");

    -- EquipmentImage
    CREATE TABLE IF NOT EXISTS "EquipmentImage" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "url" TEXT NOT NULL,
      "alt" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "equipmentId" TEXT NOT NULL REFERENCES "Equipment"("id") ON DELETE CASCADE,
      CONSTRAINT "EquipmentImage_pkey" PRIMARY KEY ("id")
    );
    ALTER TABLE "EquipmentImage" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS "EquipmentImage_equipmentId_idx" ON "EquipmentImage"("equipmentId");
    CREATE INDEX IF NOT EXISTS "EquipmentImage_equipmentId_sortOrder_idx" ON "EquipmentImage"("equipmentId", "sortOrder");

    -- Order
    CREATE TABLE IF NOT EXISTS "Order" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "customerName" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "email" TEXT,
      "dateFrom" TIMESTAMPTZ,
      "dateTo" TIMESTAMPTZ,
      "address" TEXT,
      "comment" TEXT,
      "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
      "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE CASCADE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
    CREATE INDEX IF NOT EXISTS "Order_equipmentId_idx" ON "Order"("equipmentId");

    -- ServiceRequest
    CREATE TABLE IF NOT EXISTS "ServiceRequest" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "serviceType" TEXT NOT NULL,
      "customerName" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "address" TEXT NOT NULL,
      "date" TIMESTAMPTZ NOT NULL,
      "time" TEXT NOT NULL,
      "comment" TEXT,
      "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "ServiceRequest_status_idx" ON "ServiceRequest"("status");
    CREATE INDEX IF NOT EXISTS "ServiceRequest_serviceType_idx" ON "ServiceRequest"("serviceType");

    -- RentOrder
    CREATE TABLE IF NOT EXISTS "RentOrder" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "orderNumber" INTEGER,
      "customerName" TEXT NOT NULL,
      "customerPhone" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "comment" TEXT,
      "addressFrom" TEXT,
      "addressTo" TEXT,
      "scheduledDate" TIMESTAMPTZ,
      "scheduledDateTo" TIMESTAMPTZ,
      "scheduledTimeFrom" TEXT,
      "scheduledTimeTo" TEXT,
      "agreedPrice" DOUBLE PRECISION,
      "agreedTotal" NUMERIC(12,2),
      "financeComment" TEXT,
      "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
      "workerSettlementStatus" TEXT NOT NULL DEFAULT 'NOT_SETTLED',
      "showWorkerToCustomer" BOOLEAN NOT NULL DEFAULT false,
      "finalAgreedPrice" DOUBLE PRECISION,
      "finalCashCollected" DOUBLE PRECISION,
      "finalExtraExpenses" DOUBLE PRECISION,
      "managerCloseComment" TEXT,
      "managerClosedAt" TIMESTAMPTZ,
      "managerClosedById" TEXT REFERENCES "Admin"("id") ON DELETE SET NULL,
      "sourceType" TEXT NOT NULL DEFAULT 'manual',
      "sourceRequestId" TEXT REFERENCES "Order"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "RentOrder_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "RentOrder_status_idx" ON "RentOrder"("status");
    CREATE INDEX IF NOT EXISTS "RentOrder_sourceRequestId_idx" ON "RentOrder"("sourceRequestId");

    -- RentOrderItem
    CREATE TABLE IF NOT EXISTS "RentOrderItem" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
      "equipmentId" TEXT NOT NULL REFERENCES "Equipment"("id") ON DELETE CASCADE,
      "startDate" TIMESTAMPTZ NOT NULL,
      "endDate" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "RentOrderItem_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "RentOrderItem_rentOrderId_idx" ON "RentOrderItem"("rentOrderId");
    CREATE INDEX IF NOT EXISTS "RentOrderItem_equipmentId_idx" ON "RentOrderItem"("equipmentId");

    -- BookedPeriod
    CREATE TABLE IF NOT EXISTS "BookedPeriod" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "from" TIMESTAMPTZ NOT NULL,
      "to" TIMESTAMPTZ NOT NULL,
      "note" TEXT,
      "equipmentId" TEXT NOT NULL REFERENCES "Equipment"("id") ON DELETE CASCADE,
      "orderId" TEXT REFERENCES "Order"("id") ON DELETE SET NULL,
      "rentOrderId" TEXT REFERENCES "RentOrder"("id") ON DELETE SET NULL,
      CONSTRAINT "BookedPeriod_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "BookedPeriod_equipmentId_idx" ON "BookedPeriod"("equipmentId");
    CREATE INDEX IF NOT EXISTS "BookedPeriod_from_to_idx" ON "BookedPeriod"("from","to");
    CREATE INDEX IF NOT EXISTS "BookedPeriod_rentOrderId_idx" ON "BookedPeriod"("rentOrderId");

    -- Admin
    CREATE TABLE IF NOT EXISTS "Admin" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "role" "AdminRole" NOT NULL DEFAULT 'MANAGER',
      "telegramChatId" TEXT,
      "telegramUserId" TEXT,
      "telegramUsername" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Admin_email_key" ON "Admin"("email");

    -- SiteSetting
    CREATE TABLE IF NOT EXISTS "SiteSetting" (
      "key" TEXT NOT NULL,
      "value" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
    );

    -- Service
    CREATE TABLE IF NOT EXISTS "Service" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "slug" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "shortDescription" TEXT NOT NULL,
      "fullDescription" TEXT NOT NULL,
      "image" TEXT NOT NULL,
      "priceInfo" TEXT NOT NULL,
      "pricingType" TEXT NOT NULL DEFAULT 'custom',
      "deliveryRatePerKm" DOUBLE PRECISION,
      "relatedEquipmentTypes" TEXT[] DEFAULT '{}',
      "features" TEXT[] DEFAULT '{}',
      "seoTitle" TEXT NOT NULL,
      "seoDescription" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "isPopular" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Service_slug_key" ON "Service"("slug");
    CREATE INDEX IF NOT EXISTS "Service_isActive_sortOrder_idx" ON "Service"("isActive","sortOrder");

    -- Materials
    CREATE TABLE IF NOT EXISTS "Material" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "unit" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "minOrderQuantity" DOUBLE PRECISION,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Material_slug_key" ON "Material"("slug");
    CREATE INDEX IF NOT EXISTS "Material_isActive_sortOrder_idx" ON "Material"("isActive","sortOrder");

    -- SupplierPoint
    CREATE TABLE IF NOT EXISTS "SupplierPoint" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "name" TEXT NOT NULL,
      "address" TEXT NOT NULL,
      "latitude" DOUBLE PRECISION NOT NULL,
      "longitude" DOUBLE PRECISION NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "contactName" TEXT,
      "contactPhone" TEXT,
      "workHours" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "SupplierPoint_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "SupplierPoint_isActive_idx" ON "SupplierPoint"("isActive");
    CREATE INDEX IF NOT EXISTS "SupplierPoint_coordinates_idx" ON "SupplierPoint"("latitude","longitude");

    -- SupplierMaterialOffer
    CREATE TABLE IF NOT EXISTS "SupplierMaterialOffer" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "supplierPointId" TEXT NOT NULL REFERENCES "SupplierPoint"("id") ON DELETE CASCADE,
      "materialId" TEXT NOT NULL REFERENCES "Material"("id") ON DELETE CASCADE,
      "unitPrice" DOUBLE PRECISION NOT NULL,
      "isAvailable" BOOLEAN NOT NULL DEFAULT true,
      "minOrderQuantity" DOUBLE PRECISION,
      "lastPriceUpdatedAt" TIMESTAMPTZ,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "SupplierMaterialOffer_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "SupplierMaterialOffer_supplier_material_key"
      ON "SupplierMaterialOffer"("supplierPointId","materialId");
    CREATE INDEX IF NOT EXISTS "SupplierMaterialOffer_materialId_idx" ON "SupplierMaterialOffer"("materialId");
    CREATE INDEX IF NOT EXISTS "SupplierMaterialOffer_supplierPointId_idx" ON "SupplierMaterialOffer"("supplierPointId");
    CREATE INDEX IF NOT EXISTS "SupplierMaterialOffer_isAvailable_idx" ON "SupplierMaterialOffer"("isAvailable");

    -- TrackerDevice
    CREATE TABLE IF NOT EXISTS "TrackerDevice" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "name" TEXT NOT NULL,
      "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE SET NULL,
      "lastAddress" TEXT,
      "lastLatitude" DOUBLE PRECISION,
      "lastLongitude" DOUBLE PRECISION,
      "lastEventText" TEXT,
      "lastTrackerAt" TIMESTAMPTZ,
      "lastTelegramChatId" TEXT,
      "lastTelegramMessageId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "TrackerDevice_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "TrackerDevice_name_key" ON "TrackerDevice"("name");
    CREATE UNIQUE INDEX IF NOT EXISTS "TrackerDevice_equipmentId_key" ON "TrackerDevice"("equipmentId");
    CREATE INDEX IF NOT EXISTS "TrackerDevice_lastTrackerAt_idx" ON "TrackerDevice"("lastTrackerAt");

    -- TrackerMessage
    CREATE TABLE IF NOT EXISTS "TrackerMessage" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "deviceId" TEXT NOT NULL REFERENCES "TrackerDevice"("id") ON DELETE CASCADE,
      "telegramChatId" TEXT NOT NULL,
      "telegramMessageId" TEXT NOT NULL,
      "rawText" TEXT NOT NULL,
      "eventText" TEXT NOT NULL,
      "parsedAddress" TEXT,
      "effectiveAddress" TEXT,
      "latitude" DOUBLE PRECISION,
      "longitude" DOUBLE PRECISION,
      "trackerTimestamp" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "TrackerMessage_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "TrackerMessage_chat_message_key" ON "TrackerMessage"("telegramChatId","telegramMessageId");
    CREATE INDEX IF NOT EXISTS "TrackerMessage_deviceId_idx" ON "TrackerMessage"("deviceId");
    CREATE INDEX IF NOT EXISTS "TrackerMessage_trackerTimestamp_idx" ON "TrackerMessage"("trackerTimestamp");

    -- TrackerStop
    CREATE TABLE IF NOT EXISTS "TrackerStop" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "trackerDeviceId" TEXT REFERENCES "TrackerDevice"("id") ON DELETE SET NULL,
      "source" TEXT NOT NULL,
      "sourceDeviceId" TEXT NOT NULL,
      "deviceName" TEXT NOT NULL,
      "stopStart" TIMESTAMPTZ NOT NULL,
      "stopEnd" TIMESTAMPTZ,
      "durationMs" BIGINT NOT NULL DEFAULT 0,
      "latitude" DOUBLE PRECISION,
      "longitude" DOUBLE PRECISION,
      "address" TEXT,
      "startOdometer" DOUBLE PRECISION,
      "endOdometer" DOUBLE PRECISION,
      "rawPayload" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "TrackerStop_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "TrackerStop_source_device_start_key"
      ON "TrackerStop"("source","sourceDeviceId","stopStart");
    CREATE INDEX IF NOT EXISTS "TrackerStop_trackerDeviceId_idx" ON "TrackerStop"("trackerDeviceId");
    CREATE INDEX IF NOT EXISTS "TrackerStop_stopStart_idx" ON "TrackerStop"("stopStart");

    -- TrackerDailyStat
    CREATE TABLE IF NOT EXISTS "TrackerDailyStat" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "trackerDeviceId" TEXT REFERENCES "TrackerDevice"("id") ON DELETE SET NULL,
      "source" TEXT NOT NULL,
      "sourceDeviceId" TEXT NOT NULL,
      "deviceName" TEXT NOT NULL,
      "statDate" DATE NOT NULL,
      "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "drivingDurationMs" BIGINT NOT NULL DEFAULT 0,
      "engineHoursMs" BIGINT,
      "rawPayload" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "TrackerDailyStat_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "TrackerDailyStat_source_device_date_key"
      ON "TrackerDailyStat"("source","sourceDeviceId","statDate");
    CREATE INDEX IF NOT EXISTS "TrackerDailyStat_trackerDeviceId_idx" ON "TrackerDailyStat"("trackerDeviceId");
    CREATE INDEX IF NOT EXISTS "TrackerDailyStat_statDate_idx" ON "TrackerDailyStat"("statDate");

    -- CustomerRequest
    CREATE TABLE IF NOT EXISTS "CustomerRequest" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "source" TEXT NOT NULL DEFAULT 'site',
      "requestType" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "customerName" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "email" TEXT,
      "addressFrom" TEXT,
      "addressTo" TEXT,
      "scheduledDate" TIMESTAMPTZ,
      "scheduledTime" TEXT,
      "comment" TEXT,
      "managerId" TEXT REFERENCES "Admin"("id") ON DELETE SET NULL,
      "convertedOrderId" TEXT REFERENCES "RentOrder"("id") ON DELETE SET NULL,
      "legacyOrderId" TEXT,
      "legacyServiceRequestId" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "CustomerRequest_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "CustomerRequest_status_idx" ON "CustomerRequest"("status");
    CREATE INDEX IF NOT EXISTS "CustomerRequest_requestType_idx" ON "CustomerRequest"("requestType");
    CREATE INDEX IF NOT EXISTS "CustomerRequest_createdAt_idx" ON "CustomerRequest"("createdAt");
    CREATE INDEX IF NOT EXISTS "CustomerRequest_convertedOrderId_idx" ON "CustomerRequest"("convertedOrderId");
    ALTER TABLE "CustomerRequest" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT;
    ALTER TABLE "CustomerRequest" ADD COLUMN IF NOT EXISTS "emailNormalized" TEXT;
    UPDATE "CustomerRequest"
      SET "phoneNormalized" = regexp_replace(COALESCE("phone", ''), '[^0-9+]', '', 'g')
      WHERE "phoneNormalized" IS NULL AND COALESCE("phone", '') <> '';
    UPDATE "CustomerRequest"
      SET "emailNormalized" = lower(trim("email"))
      WHERE "emailNormalized" IS NULL AND COALESCE("email", '') <> '';
    CREATE INDEX IF NOT EXISTS "CustomerRequest_phoneNormalized_idx"
      ON "CustomerRequest"("phoneNormalized") WHERE "phoneNormalized" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "CustomerRequest_emailNormalized_idx"
      ON "CustomerRequest"("emailNormalized") WHERE "emailNormalized" IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRequest_legacyOrderId_key"
      ON "CustomerRequest"("legacyOrderId") WHERE "legacyOrderId" IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRequest_legacyServiceRequestId_key"
      ON "CustomerRequest"("legacyServiceRequestId") WHERE "legacyServiceRequestId" IS NOT NULL;

    -- Customer account
    CREATE TABLE IF NOT EXISTS "CustomerAccount" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "emailNormalized" TEXT,
      "phoneNormalized" TEXT,
      "fullName" TEXT,
      "passwordHash" TEXT NOT NULL,
      "emailVerifiedAt" TIMESTAMPTZ,
      "phoneVerifiedAt" TIMESTAMPTZ,
      "isBlocked" BOOLEAN NOT NULL DEFAULT false,
      "lastLoginAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CustomerAccount_contact_check" CHECK ("emailNormalized" IS NOT NULL OR "phoneNormalized" IS NOT NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_emailNormalized_key"
      ON "CustomerAccount"("emailNormalized") WHERE "emailNormalized" IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_phoneNormalized_key"
      ON "CustomerAccount"("phoneNormalized") WHERE "phoneNormalized" IS NOT NULL;
    ALTER TABLE "CustomerAccount" ADD COLUMN IF NOT EXISTS "fullName" TEXT;
    UPDATE "CustomerAccount"
    SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", NOW()),
        "updatedAt" = NOW()
    WHERE "emailNormalized" IS NOT NULL
      AND "emailVerifiedAt" IS NULL;
    UPDATE "CustomerAccount"
    SET "phoneVerifiedAt" = COALESCE("phoneVerifiedAt", NOW()),
        "updatedAt" = NOW()
    WHERE "phoneNormalized" IS NOT NULL
      AND "phoneVerifiedAt" IS NULL;

    CREATE TABLE IF NOT EXISTS "DeletedCustomer" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "customerId" TEXT NOT NULL,
      "accountId" TEXT,
      "phoneNormalized" TEXT,
      "emailNormalized" TEXT,
      "nameNormalized" TEXT,
      "deletedByAdminId" TEXT,
      "deletedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "DeletedCustomer_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "DeletedCustomer_customerId_key" UNIQUE ("customerId")
    );
    CREATE INDEX IF NOT EXISTS "DeletedCustomer_accountId_idx" ON "DeletedCustomer"("accountId");
    CREATE INDEX IF NOT EXISTS "DeletedCustomer_phoneNormalized_idx" ON "DeletedCustomer"("phoneNormalized");
    CREATE INDEX IF NOT EXISTS "DeletedCustomer_emailNormalized_idx" ON "DeletedCustomer"("emailNormalized");

    CREATE TABLE IF NOT EXISTS "CustomerContactVerification" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "accountId" TEXT NOT NULL REFERENCES "CustomerAccount"("id") ON DELETE CASCADE,
      "channel" TEXT NOT NULL,
      "targetNormalized" TEXT NOT NULL,
      "codeHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "consumedAt" TIMESTAMPTZ,
      "attemptCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "CustomerContactVerification_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "CustomerContactVerification_accountId_idx" ON "CustomerContactVerification"("accountId");
    CREATE INDEX IF NOT EXISTS "CustomerContactVerification_target_idx" ON "CustomerContactVerification"("channel", "targetNormalized", "createdAt");

    CREATE TABLE IF NOT EXISTS "CustomerSession" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "accountId" TEXT NOT NULL REFERENCES "CustomerAccount"("id") ON DELETE CASCADE,
      "sessionTokenHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "revokedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "lastSeenAt" TIMESTAMPTZ,
      "userAgentHash" TEXT,
      "ipHash" TEXT,
      CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSession_token_key" ON "CustomerSession"("sessionTokenHash");
    CREATE INDEX IF NOT EXISTS "CustomerSession_accountId_idx" ON "CustomerSession"("accountId");
    CREATE INDEX IF NOT EXISTS "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

    CREATE TABLE IF NOT EXISTS "CustomerRequestAccountLink" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "accountId" TEXT NOT NULL REFERENCES "CustomerAccount"("id") ON DELETE CASCADE,
      "customerRequestId" TEXT NOT NULL REFERENCES "CustomerRequest"("id") ON DELETE CASCADE,
      "matchedBy" TEXT NOT NULL,
      "verifiedContact" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "CustomerRequestAccountLink_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRequestAccountLink_request_key"
      ON "CustomerRequestAccountLink"("customerRequestId");
    CREATE INDEX IF NOT EXISTS "CustomerRequestAccountLink_account_idx"
      ON "CustomerRequestAccountLink"("accountId", "createdAt");
    UPDATE "CustomerAccount" account
    SET "fullName" = source."customerName",
        "updatedAt" = NOW()
    FROM (
      SELECT DISTINCT ON (link."accountId")
        link."accountId",
        NULLIF(BTRIM(cr."customerName"), '') AS "customerName"
      FROM "CustomerRequestAccountLink" link
      JOIN "CustomerRequest" cr ON cr."id" = link."customerRequestId"
      WHERE NULLIF(BTRIM(cr."customerName"), '') IS NOT NULL
      ORDER BY link."accountId", cr."createdAt" DESC
    ) source
    WHERE account."id" = source."accountId"
      AND NULLIF(BTRIM(COALESCE(account."fullName", '')), '') IS NULL;

    -- CustomerRequestItem
    CREATE TABLE IF NOT EXISTS "CustomerRequestItem" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "requestId" TEXT NOT NULL REFERENCES "CustomerRequest"("id") ON DELETE CASCADE,
      "itemType" TEXT NOT NULL,
      "refId" TEXT,
      "titleSnapshot" TEXT NOT NULL,
      "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
      "unit" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "CustomerRequestItem_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "CustomerRequestItem_requestId_idx" ON "CustomerRequestItem"("requestId");
    CREATE INDEX IF NOT EXISTS "CustomerRequestItem_itemType_idx" ON "CustomerRequestItem"("itemType");

    -- MarketingTrackingLink
    CREATE TABLE IF NOT EXISTS "MarketingTrackingLink" (
      "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      "code" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "destinationPath" TEXT NOT NULL,
      "utmSource" TEXT,
      "utmMedium" TEXT,
      "utmCampaign" TEXT,
      "utmContent" TEXT,
      "utmTerm" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "idx_marketing_tracking_link_code"
      ON "MarketingTrackingLink" ("code");
    CREATE INDEX IF NOT EXISTS "idx_marketing_tracking_link_created_at"
      ON "MarketingTrackingLink" ("createdAt");

    -- MarketingTrackingClick
    CREATE TABLE IF NOT EXISTS "MarketingTrackingClick" (
      "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      "trackingLinkId" TEXT NOT NULL REFERENCES "MarketingTrackingLink"("id") ON DELETE CASCADE,
      "code" TEXT NOT NULL,
      "referrer" TEXT,
      "landingUrl" TEXT,
      "userAgent" TEXT,
      "ipHash" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "idx_marketing_tracking_click_link_id"
      ON "MarketingTrackingClick" ("trackingLinkId");
    CREATE INDEX IF NOT EXISTS "idx_marketing_tracking_click_created_at"
      ON "MarketingTrackingClick" ("createdAt");

    -- MarketingVisit
    CREATE TABLE IF NOT EXISTS "MarketingVisit" (
      "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      "sessionKey" TEXT NOT NULL,
      "trafficSource" TEXT,
      "trackingCode" TEXT,
      "trackingLinkId" TEXT REFERENCES "MarketingTrackingLink"("id") ON DELETE SET NULL,
      "landingPage" TEXT,
      "referrer" TEXT,
      "userAgent" TEXT,
      "ipHash" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "idx_marketing_visit_created_at"
      ON "MarketingVisit" ("createdAt");
    CREATE INDEX IF NOT EXISTS "idx_marketing_visit_traffic_source"
      ON "MarketingVisit" ("trafficSource");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketing_visit_session_landing_page"
      ON "MarketingVisit" ("sessionKey", "landingPage");

    -- CustomerRequestAttribution
    CREATE TABLE IF NOT EXISTS "CustomerRequestAttribution" (
      "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      "customerRequestId" TEXT REFERENCES "CustomerRequest"("id") ON DELETE CASCADE,
      "legacyOrderId" TEXT,
      "legacyServiceRequestId" TEXT,
      "trafficSource" TEXT,
      "trackingCode" TEXT,
      "trackingLinkId" TEXT REFERENCES "MarketingTrackingLink"("id") ON DELETE SET NULL,
      "firstUtmSource" TEXT,
      "firstUtmMedium" TEXT,
      "firstUtmCampaign" TEXT,
      "firstUtmContent" TEXT,
      "firstUtmTerm" TEXT,
      "firstGclid" TEXT,
      "firstFbclid" TEXT,
      "firstTtclid" TEXT,
      "firstReferrer" TEXT,
      "firstLandingPage" TEXT,
      "firstCapturedAt" TIMESTAMPTZ,
      "lastUtmSource" TEXT,
      "lastUtmMedium" TEXT,
      "lastUtmCampaign" TEXT,
      "lastUtmContent" TEXT,
      "lastUtmTerm" TEXT,
      "lastGclid" TEXT,
      "lastFbclid" TEXT,
      "lastTtclid" TEXT,
      "lastReferrer" TEXT,
      "lastLandingPage" TEXT,
      "lastCapturedAt" TIMESTAMPTZ,
      "formPage" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "idx_customer_request_attribution_customer_request_id"
      ON "CustomerRequestAttribution" ("customerRequestId");
    CREATE INDEX IF NOT EXISTS "idx_customer_request_attribution_tracking_link_id"
      ON "CustomerRequestAttribution" ("trackingLinkId");
    CREATE INDEX IF NOT EXISTS "idx_customer_request_attribution_traffic_source"
      ON "CustomerRequestAttribution" ("trafficSource");
    CREATE INDEX IF NOT EXISTS "idx_customer_request_attribution_created_at"
      ON "CustomerRequestAttribution" ("createdAt");

    -- Employee
    CREATE TABLE IF NOT EXISTS "Employee" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "fullName" TEXT NOT NULL,
      "role" TEXT,
      "phone" TEXT,
      "telegramChatId" TEXT,
      "telegramUserId" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Employee_telegramUserId_key"
      ON "Employee"("telegramUserId") WHERE "telegramUserId" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "Employee_isActive_idx" ON "Employee"("isActive");

    -- EmployeeTelegramCandidate
    CREATE TABLE IF NOT EXISTS "EmployeeTelegramCandidate" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "telegramUserId" TEXT NOT NULL,
      "telegramChatId" TEXT NOT NULL,
      "username" TEXT,
      "firstName" TEXT,
      "lastName" TEXT,
      "languageCode" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE SET NULL,
      "adminId" TEXT REFERENCES "Admin"("id") ON DELETE SET NULL,
      "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "approvedAt" TIMESTAMPTZ,
      "approvedBy" TEXT REFERENCES "Admin"("id") ON DELETE SET NULL,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EmployeeTelegramCandidate_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeTelegramCandidate_telegramUserId_key"
      ON "EmployeeTelegramCandidate"("telegramUserId");
    CREATE INDEX IF NOT EXISTS "EmployeeTelegramCandidate_status_idx"
      ON "EmployeeTelegramCandidate"("status");

    -- Extend RentOrder with CRM source link
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "sourceCustomerRequestId" TEXT;
    DO $$ BEGIN
      ALTER TABLE "RentOrder"
      ADD CONSTRAINT "RentOrder_sourceCustomerRequestId_fkey"
      FOREIGN KEY ("sourceCustomerRequestId") REFERENCES "CustomerRequest"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS "RentOrder_sourceCustomerRequestId_idx"
      ON "RentOrder"("sourceCustomerRequestId");

    -- WorkAssignment
    CREATE TABLE IF NOT EXISTS "WorkAssignment" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "orderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
      "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "respondedAt" TIMESTAMPTZ,
      "responseComment" TEXT,
      "declineReason" TEXT,
      "telegramMessageId" TEXT,
      "assignedByManagerId" TEXT REFERENCES "Admin"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "WorkAssignment_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "WorkAssignment_orderId_idx" ON "WorkAssignment"("orderId");
    CREATE INDEX IF NOT EXISTS "WorkAssignment_employeeId_idx" ON "WorkAssignment"("employeeId");
    CREATE INDEX IF NOT EXISTS "WorkAssignment_status_idx" ON "WorkAssignment"("status");
    ALTER TABLE "WorkAssignment" ADD COLUMN IF NOT EXISTS "equipmentId" TEXT;
    ALTER TABLE "WorkAssignment" ADD COLUMN IF NOT EXISTS "completionStatus" TEXT NOT NULL DEFAULT 'PENDING';
    ALTER TABLE "WorkAssignment" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;
    ALTER TABLE "WorkAssignment" ADD COLUMN IF NOT EXISTS "completionComment" TEXT;
    ALTER TABLE "WorkAssignment" ADD COLUMN IF NOT EXISTS "plannedNextStartAt" TIMESTAMPTZ;
    ALTER TABLE "WorkAssignment" ADD COLUMN IF NOT EXISTS "plannedDurationMinutes" INTEGER;
    DO $$ BEGIN
      ALTER TABLE "WorkAssignment"
      ADD CONSTRAINT "WorkAssignment_equipmentId_fkey"
      FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS "WorkAssignment_equipmentId_idx" ON "WorkAssignment"("equipmentId");
    CREATE INDEX IF NOT EXISTS "WorkAssignment_completionStatus_idx" ON "WorkAssignment"("completionStatus");

    -- WorkExecutionSession
    CREATE TABLE IF NOT EXISTS "WorkExecutionSession" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "orderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
      "assignmentId" TEXT REFERENCES "WorkAssignment"("id") ON DELETE SET NULL,
      "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
      "startedAt" TIMESTAMPTZ,
      "finishedAt" TIMESTAMPTZ,
      "startedVia" TEXT,
      "finishedVia" TEXT,
      "trackerDeviceId" TEXT REFERENCES "TrackerDevice"("id") ON DELETE SET NULL,
      "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "WorkExecutionSession_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "WorkExecutionSession_orderId_idx"
      ON "WorkExecutionSession"("orderId");
    CREATE INDEX IF NOT EXISTS "WorkExecutionSession_assignmentId_idx"
      ON "WorkExecutionSession"("assignmentId");
    CREATE INDEX IF NOT EXISTS "WorkExecutionSession_status_idx"
      ON "WorkExecutionSession"("status");
    ALTER TABLE "WorkExecutionSession" ADD COLUMN IF NOT EXISTS "sequenceNumber" INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE "WorkExecutionSession" ADD COLUMN IF NOT EXISTS "shiftLabel" TEXT;
    ALTER TABLE "WorkExecutionSession" ADD COLUMN IF NOT EXISTS "isFinalSession" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "WorkExecutionSession" ADD COLUMN IF NOT EXISTS "sessionComment" TEXT;
    ALTER TABLE "WorkExecutionSession" ADD COLUMN IF NOT EXISTS "plannedDurationMinutes" INTEGER;
    ALTER TABLE "WorkExecutionSession" ADD COLUMN IF NOT EXISTS "durationDeltaMinutes" INTEGER;
    ALTER TABLE "WorkExecutionSession" ADD COLUMN IF NOT EXISTS "durationStatus" TEXT;
    CREATE INDEX IF NOT EXISTS "WorkExecutionSession_assignmentId_sequenceNumber_idx"
      ON "WorkExecutionSession"("assignmentId","sequenceNumber");

    -- WorkExecutionReport
    CREATE TABLE IF NOT EXISTS "WorkExecutionReport" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "executionSessionId" TEXT NOT NULL REFERENCES "WorkExecutionSession"("id") ON DELETE CASCADE,
      "distanceKm" DOUBLE PRECISION,
      "driveDurationMinutes" DOUBLE PRECISION,
      "idleDurationMinutes" DOUBLE PRECISION,
      "stopDurationMinutes" DOUBLE PRECISION,
      "engineHours" DOUBLE PRECISION,
      "cashCollected" BOOLEAN,
      "cashAmount" DOUBLE PRECISION,
      "extraExpensesAmount" DOUBLE PRECISION,
      "extraExpensesType" TEXT,
      "extraExpensesComment" TEXT,
      "hadProblems" BOOLEAN,
      "problemsComment" TEXT,
      "workerComment" TEXT,
      "questionnaireStep" TEXT NOT NULL DEFAULT 'NOT_STARTED',
      "questionnaireStatus" TEXT NOT NULL DEFAULT 'PENDING',
      "awaitingTextField" TEXT,
      "submittedAt" TIMESTAMPTZ,
      "gpsSnapshotJson" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "WorkExecutionReport_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "WorkExecutionReport_executionSessionId_key"
      ON "WorkExecutionReport"("executionSessionId");

    -- OrderEventLog
    CREATE TABLE IF NOT EXISTS "OrderEventLog" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "requestId" TEXT REFERENCES "CustomerRequest"("id") ON DELETE SET NULL,
      "orderId" TEXT REFERENCES "RentOrder"("id") ON DELETE SET NULL,
      "assignmentId" TEXT REFERENCES "WorkAssignment"("id") ON DELETE SET NULL,
      "eventType" TEXT NOT NULL,
      "payload" JSONB,
      "createdByAdminId" TEXT REFERENCES "Admin"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "OrderEventLog_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "OrderEventLog_requestId_idx" ON "OrderEventLog"("requestId");
    CREATE INDEX IF NOT EXISTS "OrderEventLog_orderId_idx" ON "OrderEventLog"("orderId");
    CREATE INDEX IF NOT EXISTS "OrderEventLog_assignmentId_idx" ON "OrderEventLog"("assignmentId");
    CREATE INDEX IF NOT EXISTS "OrderEventLog_eventType_idx" ON "OrderEventLog"("eventType");

    -- NotificationOutbox
    CREATE TABLE IF NOT EXISTS "NotificationOutbox" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "channel" TEXT NOT NULL,
      "topic" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "target" TEXT,
      "payload" JSONB NOT NULL,
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "lastAttemptAt" TIMESTAMPTZ,
      "sentAt" TIMESTAMPTZ,
      "errorText" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "NotificationOutbox_status_idx"
      ON "NotificationOutbox"("status");
    CREATE INDEX IF NOT EXISTS "NotificationOutbox_channel_topic_idx"
      ON "NotificationOutbox"("channel","topic");

    -- NotificationTemplate
    CREATE TABLE IF NOT EXISTS "NotificationTemplate" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "key" TEXT NOT NULL,
      "serviceSlug" TEXT,
      "name" TEXT NOT NULL,
      "channel" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "recipientType" TEXT NOT NULL,
      "isEnabled" BOOLEAN NOT NULL DEFAULT true,
      "bodyTemplate" TEXT NOT NULL,
      "notes" TEXT,
      "supportsHtml" BOOLEAN NOT NULL DEFAULT true,
      "hasInteractiveButtons" BOOLEAN NOT NULL DEFAULT false,
      "isSystem" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedByAdminId" TEXT REFERENCES "Admin"("id") ON DELETE SET NULL,
      CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
    );
    ALTER TABLE "NotificationTemplate" ADD COLUMN IF NOT EXISTS "serviceSlug" TEXT;
    DROP INDEX IF EXISTS "NotificationTemplate_key_key";
    CREATE UNIQUE INDEX IF NOT EXISTS "NotificationTemplate_key_default_key"
      ON "NotificationTemplate"("key")
      WHERE "serviceSlug" IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "NotificationTemplate_key_service_key"
      ON "NotificationTemplate"("key","serviceSlug")
      WHERE "serviceSlug" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "NotificationTemplate_serviceSlug_idx"
      ON "NotificationTemplate"("serviceSlug");
    CREATE INDEX IF NOT EXISTS "NotificationTemplate_channel_category_idx"
      ON "NotificationTemplate"("channel","category");
    CREATE INDEX IF NOT EXISTS "NotificationTemplate_isEnabled_idx"
      ON "NotificationTemplate"("isEnabled");

    -- Finance: reusable price item templates
    CREATE TABLE IF NOT EXISTS "PriceItemTemplate" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "title" TEXT NOT NULL,
      "calculationType" TEXT NOT NULL,
      "defaultUnit" TEXT,
      "defaultUnitPrice" NUMERIC(12,2),
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "PriceItemTemplate_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "PriceItemTemplate_isActive_sortOrder_idx"
      ON "PriceItemTemplate"("isActive","sortOrder");
    CREATE UNIQUE INDEX IF NOT EXISTS "PriceItemTemplate_title_calculationType_key"
      ON "PriceItemTemplate"("title","calculationType");

    -- Finance: customer-facing price calculation rows for a rent order
    CREATE TABLE IF NOT EXISTS "OrderPriceItem" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
      "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE SET NULL,
      "serviceId" TEXT REFERENCES "Service"("id") ON DELETE SET NULL,
      "templateId" TEXT REFERENCES "PriceItemTemplate"("id") ON DELETE SET NULL,
      "title" TEXT NOT NULL,
      "calculationType" TEXT NOT NULL,
      "quantity" NUMERIC(12,2) NOT NULL DEFAULT 1,
      "unit" TEXT,
      "unitPrice" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "total" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "source" TEXT NOT NULL DEFAULT 'manual',
      "comment" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "OrderPriceItem_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "OrderPriceItem_rentOrderId_idx"
      ON "OrderPriceItem"("rentOrderId");
    CREATE INDEX IF NOT EXISTS "OrderPriceItem_equipmentId_idx"
      ON "OrderPriceItem"("equipmentId");
    CREATE INDEX IF NOT EXISTS "OrderPriceItem_serviceId_idx"
      ON "OrderPriceItem"("serviceId");
    CREATE INDEX IF NOT EXISTS "OrderPriceItem_templateId_idx"
      ON "OrderPriceItem"("templateId");

    -- Finance: customer payments for a rent order
    CREATE TABLE IF NOT EXISTS "OrderPayment" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
      "executionSessionId" TEXT REFERENCES "WorkExecutionSession"("id") ON DELETE SET NULL,
      "amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "method" TEXT NOT NULL DEFAULT 'cash',
      "receivedByType" TEXT NOT NULL DEFAULT 'manager',
      "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE SET NULL,
      "paidAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "comment" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
    );
    ALTER TABLE "OrderPayment" ADD COLUMN IF NOT EXISTS "executionSessionId" TEXT;
    CREATE INDEX IF NOT EXISTS "OrderPayment_rentOrderId_idx"
      ON "OrderPayment"("rentOrderId");
    CREATE INDEX IF NOT EXISTS "OrderPayment_employeeId_idx"
      ON "OrderPayment"("employeeId");
    CREATE INDEX IF NOT EXISTS "OrderPayment_executionSessionId_idx"
      ON "OrderPayment"("executionSessionId");
    CREATE INDEX IF NOT EXISTS "OrderPayment_paidAt_idx"
      ON "OrderPayment"("paidAt");
    DO $$ BEGIN
      ALTER TABLE "OrderPayment"
      ADD CONSTRAINT "OrderPayment_executionSessionId_fkey"
      FOREIGN KEY ("executionSessionId") REFERENCES "WorkExecutionSession"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    -- Finance: payment links created via monobank acquiring
    CREATE TABLE IF NOT EXISTS "MonobankInvoice" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
      "invoiceId" TEXT NOT NULL,
      "reference" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'created',
      "amountKop" INTEGER NOT NULL,
      "ccy" INTEGER NOT NULL DEFAULT 980,
      "pageUrl" TEXT,
      "destination" TEXT,
      "webHookUrl" TEXT,
      "redirectUrl" TEXT,
      "finalAmountKop" INTEGER,
      "failureReason" TEXT,
      "monoCreatedDate" TIMESTAMPTZ,
      "monoModifiedDate" TIMESTAMPTZ,
      "payloadJson" JSONB,
      "orderPaymentId" TEXT REFERENCES "OrderPayment"("id") ON DELETE SET NULL,
      "paidAt" TIMESTAMPTZ,
      "createdByAdminId" TEXT REFERENCES "Admin"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "MonobankInvoice_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "MonobankInvoice_invoiceId_key"
      ON "MonobankInvoice"("invoiceId");
    CREATE UNIQUE INDEX IF NOT EXISTS "MonobankInvoice_reference_key"
      ON "MonobankInvoice"("reference");
    CREATE INDEX IF NOT EXISTS "MonobankInvoice_rentOrderId_idx"
      ON "MonobankInvoice"("rentOrderId");
    CREATE INDEX IF NOT EXISTS "MonobankInvoice_status_idx"
      ON "MonobankInvoice"("status");
    CREATE INDEX IF NOT EXISTS "MonobankInvoice_orderPaymentId_idx"
      ON "MonobankInvoice"("orderPaymentId");

    -- Finance: expenses tied to a specific rent order
    CREATE TABLE IF NOT EXISTS "OrderExpense" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
      "executionSessionId" TEXT REFERENCES "WorkExecutionSession"("id") ON DELETE SET NULL,
      "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE SET NULL,
      "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE SET NULL,
      "type" TEXT NOT NULL,
      "amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "fuelLiters" NUMERIC(12,2),
      "fuelPricePerLiter" NUMERIC(12,2),
      "comment" TEXT,
      "source" TEXT NOT NULL DEFAULT 'manager',
      "expenseAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "OrderExpense_pkey" PRIMARY KEY ("id")
    );
    ALTER TABLE "OrderExpense" ADD COLUMN IF NOT EXISTS "executionSessionId" TEXT;
    CREATE INDEX IF NOT EXISTS "OrderExpense_rentOrderId_idx"
      ON "OrderExpense"("rentOrderId");
    CREATE INDEX IF NOT EXISTS "OrderExpense_equipmentId_idx"
      ON "OrderExpense"("equipmentId");
    CREATE INDEX IF NOT EXISTS "OrderExpense_employeeId_idx"
      ON "OrderExpense"("employeeId");
    CREATE INDEX IF NOT EXISTS "OrderExpense_executionSessionId_idx"
      ON "OrderExpense"("executionSessionId");
    CREATE INDEX IF NOT EXISTS "OrderExpense_expenseAt_idx"
      ON "OrderExpense"("expenseAt");
    CREATE INDEX IF NOT EXISTS "OrderExpense_type_idx"
      ON "OrderExpense"("type");
    DO $$ BEGIN
      ALTER TABLE "OrderExpense"
      ADD CONSTRAINT "OrderExpense_executionSessionId_fkey"
      FOREIGN KEY ("executionSessionId") REFERENCES "WorkExecutionSession"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    ALTER TABLE "OrderExpense" ADD COLUMN IF NOT EXISTS "fuelLiters" NUMERIC(12,2);
    ALTER TABLE "OrderExpense" ADD COLUMN IF NOT EXISTS "fuelPricePerLiter" NUMERIC(12,2);

    -- Finance: planned/final worker compensation for a rent order
    CREATE TABLE IF NOT EXISTS "WorkerCompensation" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "rentOrderId" TEXT NOT NULL REFERENCES "RentOrder"("id") ON DELETE CASCADE,
      "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE SET NULL,
      "type" TEXT NOT NULL DEFAULT 'fixed',
      "rate" NUMERIC(12,2),
      "quantity" NUMERIC(12,2),
      "percent" NUMERIC(5,2),
      "calculatedAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "finalAmount" NUMERIC(12,2),
      "status" TEXT NOT NULL DEFAULT 'NOT_SETTLED',
      "comment" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "WorkerCompensation_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "WorkerCompensation_rentOrderId_idx"
      ON "WorkerCompensation"("rentOrderId");
    CREATE INDEX IF NOT EXISTS "WorkerCompensation_employeeId_idx"
      ON "WorkerCompensation"("employeeId");
    CREATE INDEX IF NOT EXISTS "WorkerCompensation_status_idx"
      ON "WorkerCompensation"("status");
    ALTER TABLE "WorkerCompensation" ALTER COLUMN "finalAmount" DROP NOT NULL;
    ALTER TABLE "WorkerCompensation" ALTER COLUMN "finalAmount" DROP DEFAULT;
    ALTER TABLE "WorkerCompensation" ADD COLUMN IF NOT EXISTS "assignmentId" TEXT;
    ALTER TABLE "WorkerCompensation" ADD COLUMN IF NOT EXISTS "equipmentId" TEXT;
    DO $$ BEGIN
      ALTER TABLE "WorkerCompensation"
      ADD CONSTRAINT "WorkerCompensation_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "WorkAssignment"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "WorkerCompensation"
      ADD CONSTRAINT "WorkerCompensation_equipmentId_fkey"
      FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS "WorkerCompensation_assignmentId_idx"
      ON "WorkerCompensation"("assignmentId");
    CREATE INDEX IF NOT EXISTS "WorkerCompensation_equipmentId_idx"
      ON "WorkerCompensation"("equipmentId");

    -- Finance: actual settlements between company and employees
    CREATE TABLE IF NOT EXISTS "EmployeeSettlement" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
      "rentOrderId" TEXT REFERENCES "RentOrder"("id") ON DELETE SET NULL,
      "amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "direction" TEXT NOT NULL,
      "method" TEXT NOT NULL DEFAULT 'cash',
      "settledAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "comment" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EmployeeSettlement_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "EmployeeSettlement_employeeId_idx"
      ON "EmployeeSettlement"("employeeId");
    CREATE INDEX IF NOT EXISTS "EmployeeSettlement_rentOrderId_idx"
      ON "EmployeeSettlement"("rentOrderId");
    CREATE INDEX IF NOT EXISTS "EmployeeSettlement_settledAt_idx"
      ON "EmployeeSettlement"("settledAt");
    CREATE INDEX IF NOT EXISTS "EmployeeSettlement_direction_idx"
      ON "EmployeeSettlement"("direction");

    -- Finance: general expenses attached to a piece of equipment
    CREATE TABLE IF NOT EXISTS "EquipmentExpense" (
      "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE CASCADE,
      "type" TEXT NOT NULL,
      "expenseDate" DATE NOT NULL,
      "amount" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "fuelLiters" NUMERIC(12,2),
      "fuelPricePerLiter" NUMERIC(12,2),
      "comment" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EquipmentExpense_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "EquipmentExpense_equipmentId_idx"
      ON "EquipmentExpense"("equipmentId");
    CREATE INDEX IF NOT EXISTS "EquipmentExpense_expenseDate_idx"
      ON "EquipmentExpense"("expenseDate");
    CREATE INDEX IF NOT EXISTS "EquipmentExpense_type_idx"
      ON "EquipmentExpense"("type");
    ALTER TABLE "EquipmentExpense" ALTER COLUMN "equipmentId" DROP NOT NULL;

    -- Migrate: if Service table existed with enum array column, convert to text[]
    DO $$ BEGIN
      ALTER TABLE "Service" ALTER COLUMN "relatedEquipmentTypes" TYPE TEXT[] USING "relatedEquipmentTypes"::TEXT[];
    EXCEPTION WHEN OTHERS THEN NULL; END $$;

    -- Migrate: pricing types are backend-validated text values, not a growing DB enum.
    DO $$ BEGIN
      ALTER TABLE "Service" ALTER COLUMN "pricingType" DROP DEFAULT;
      ALTER TABLE "Service" ALTER COLUMN "pricingType" TYPE TEXT USING "pricingType"::TEXT;
      ALTER TABLE "Service" ALTER COLUMN "pricingType" SET DEFAULT 'custom';
    EXCEPTION WHEN OTHERS THEN NULL; END $$;
    ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "deliveryRatePerKm" DOUBLE PRECISION;
    ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "isPopular" BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS "Service_isPopular_idx" ON "Service"("isPopular");
    DO $$ BEGIN
      ALTER TABLE "Service"
      ADD CONSTRAINT "Service_pricingType_check"
      CHECK ("pricingType" IN ('fixed_from','hourly_from','calculator','tow_calculator','material_delivery_calculator','custom')) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "Service"
      ADD CONSTRAINT "Service_deliveryRatePerKm_positive_check"
      CHECK ("deliveryRatePerKm" IS NULL OR "deliveryRatePerKm" > 0) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    -- Migrate: scheduled calculators need stable equipment base locations.
    ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "pricingType" TEXT NOT NULL DEFAULT 'hourly_from';
    ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "baseAddress" TEXT;
    ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "baseLatitude" DOUBLE PRECISION;
    ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "baseLongitude" DOUBLE PRECISION;
    DO $$ BEGIN
      ALTER TABLE "Equipment"
      ADD CONSTRAINT "Equipment_baseLatitude_range_check"
      CHECK ("baseLatitude" IS NULL OR ("baseLatitude" >= -90 AND "baseLatitude" <= 90)) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "Equipment"
      ADD CONSTRAINT "Equipment_baseLongitude_range_check"
      CHECK ("baseLongitude" IS NULL OR ("baseLongitude" >= -180 AND "baseLongitude" <= 180)) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "SupplierPoint"
      ADD CONSTRAINT "SupplierPoint_latitude_range_check"
      CHECK ("latitude" >= -90 AND "latitude" <= 90) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "SupplierPoint"
      ADD CONSTRAINT "SupplierPoint_longitude_range_check"
      CHECK ("longitude" >= -180 AND "longitude" <= 180) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "SupplierMaterialOffer"
      ADD CONSTRAINT "SupplierMaterialOffer_unitPrice_positive_check"
      CHECK ("unitPrice" > 0) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    -- Migrate: convert Equipment.type from enum to text to support custom types
    DO $$ BEGIN
      ALTER TABLE "Equipment" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;
    EXCEPTION WHEN OTHERS THEN NULL; END $$;

    -- Migrate: normalize equipment types to Ukrainian labels
    UPDATE "Equipment"
    SET "type" = CASE
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'excavator' OR lower("type") = 'екскаватор' THEN 'Екскаватор'
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'loader' OR lower("type") = 'навантажувач' THEN 'Навантажувач'
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'bulldozer' OR lower("type") = 'бульдозер' THEN 'Бульдозер'
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'crane' OR lower("type") = 'кран' THEN 'Кран'
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'roller' OR lower("type") = 'каток' THEN 'Каток'
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'dump truck' OR lower("type") = 'самоскид' THEN 'Самоскид'
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'concrete mixer' OR lower("type") = 'бетонозмішувач' THEN 'Бетонозмішувач'
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'generator' OR lower("type") = 'генератор' THEN 'Генератор'
      WHEN lower(replace(replace("type", '-', ' '), '_', ' ')) = 'other' OR lower("type") = 'інше' THEN 'Інше'
      ELSE initcap(btrim("type"))
    END
    WHERE "type" IS NOT NULL AND btrim("type") <> '';

    -- Seed reusable equipment types catalog with built-ins and existing values
    INSERT INTO "EquipmentTypeCatalog" ("value")
    VALUES
      ('Екскаватор'),
      ('Навантажувач'),
      ('Бульдозер'),
      ('Кран'),
      ('Каток'),
      ('Самоскид'),
      ('Бетонозмішувач'),
      ('Генератор'),
      ('Інше')
    ON CONFLICT ("value") DO NOTHING;
    DELETE FROM "EquipmentTypeCatalog"
    WHERE lower(replace(replace("value", '-', ' '), '_', ' ')) IN (
      'excavator',
      'loader',
      'bulldozer',
      'crane',
      'roller',
      'dump truck',
      'concrete mixer',
      'generator',
      'other'
    );
    INSERT INTO "EquipmentTypeCatalog" ("value")
    SELECT DISTINCT "type"
    FROM "Equipment"
    WHERE "type" IS NOT NULL AND btrim("type") <> ''
    ON CONFLICT ("value") DO NOTHING;

    -- Migrate: normalize service related equipment types to Ukrainian labels
    UPDATE "Service"
    SET "relatedEquipmentTypes" = ARRAY(
      SELECT CASE
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'excavator' OR lower(v.value) = 'екскаватор' THEN 'Екскаватор'
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'loader' OR lower(v.value) = 'навантажувач' THEN 'Навантажувач'
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'bulldozer' OR lower(v.value) = 'бульдозер' THEN 'Бульдозер'
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'crane' OR lower(v.value) = 'кран' THEN 'Кран'
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'roller' OR lower(v.value) = 'каток' THEN 'Каток'
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'dump truck' OR lower(v.value) = 'самоскид' THEN 'Самоскид'
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'concrete mixer' OR lower(v.value) = 'бетонозмішувач' THEN 'Бетонозмішувач'
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'generator' OR lower(v.value) = 'генератор' THEN 'Генератор'
        WHEN lower(replace(replace(v.value, '-', ' '), '_', ' ')) = 'other' OR lower(v.value) = 'інше' THEN 'Інше'
        ELSE initcap(btrim(v.value))
      END
      FROM unnest(COALESCE("relatedEquipmentTypes", '{}'::text[])) WITH ORDINALITY AS v(value, ord)
      ORDER BY v.ord
    );

    -- Migrate: extend existing TrackerDevice table with equipment link
    ALTER TABLE "TrackerDevice" ADD COLUMN IF NOT EXISTS "equipmentId" TEXT;
    ALTER TABLE "TrackerDevice" ADD COLUMN IF NOT EXISTS "lastLatitude" DOUBLE PRECISION;
    ALTER TABLE "TrackerDevice" ADD COLUMN IF NOT EXISTS "lastLongitude" DOUBLE PRECISION;
    DO $$ BEGIN
      ALTER TABLE "TrackerDevice"
      ADD CONSTRAINT "TrackerDevice_equipmentId_fkey"
      FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS "TrackerDevice_equipmentId_key" ON "TrackerDevice"("equipmentId");
    ALTER TABLE "TrackerMessage" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
    ALTER TABLE "TrackerMessage" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

    -- Ensure id defaults exist (Prisma-created tables lack them)
    ALTER TABLE "Equipment" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "EquipmentSpec" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "EquipmentImage" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "EquipmentTypeCatalog" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "Order" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "ServiceRequest" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "RentOrder" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "orderNumber" INTEGER;
    CREATE SEQUENCE IF NOT EXISTS "RentOrder_orderNumber_seq" START WITH 1001;
    WITH current_max AS (
      SELECT COALESCE(MAX("orderNumber"), 1000) AS "value"
      FROM "RentOrder"
    ),
    numbered AS (
      SELECT
        "id",
        ROW_NUMBER() OVER (ORDER BY "createdAt", "id") + current_max."value" AS "nextNumber"
      FROM "RentOrder"
      CROSS JOIN current_max
      WHERE "orderNumber" IS NULL
    )
    UPDATE "RentOrder" ro
    SET "orderNumber" = numbered."nextNumber"
    FROM numbered
    WHERE ro."id" = numbered."id";
    SELECT setval(
      '"RentOrder_orderNumber_seq"',
      GREATEST((SELECT COALESCE(MAX("orderNumber"), 1000) FROM "RentOrder"), 1000),
      true
    );
    ALTER TABLE "RentOrder"
      ALTER COLUMN "orderNumber" SET DEFAULT nextval('"RentOrder_orderNumber_seq"');
    CREATE UNIQUE INDEX IF NOT EXISTS "RentOrder_orderNumber_key" ON "RentOrder"("orderNumber");
    DO $$ BEGIN
      ALTER TABLE "RentOrder" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
    EXCEPTION WHEN OTHERS THEN NULL; END $$;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "scheduledDate" TIMESTAMPTZ;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "addressFrom" TEXT;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "addressTo" TEXT;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "scheduledDateTo" TIMESTAMPTZ;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "scheduledTimeFrom" TEXT;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "scheduledTimeTo" TEXT;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "agreedPrice" DOUBLE PRECISION;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "agreedTotal" NUMERIC(12,2);
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "financeComment" TEXT;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID';
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "workerSettlementStatus" TEXT NOT NULL DEFAULT 'NOT_SETTLED';
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "showWorkerToCustomer" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "finalAgreedPrice" DOUBLE PRECISION;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "finalCashCollected" DOUBLE PRECISION;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "finalExtraExpenses" DOUBLE PRECISION;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "managerCloseComment" TEXT;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "managerClosedAt" TIMESTAMPTZ;
    ALTER TABLE "RentOrder" ADD COLUMN IF NOT EXISTS "managerClosedById" TEXT;
    DO $$ BEGIN
      ALTER TABLE "RentOrder"
      ADD CONSTRAINT "RentOrder_managerClosedById_fkey"
      FOREIGN KEY ("managerClosedById") REFERENCES "Admin"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    ALTER TABLE "RentOrderItem" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "BookedPeriod" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "Admin" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
    ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT;
    ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "Admin_telegramUserId_key"
      ON "Admin"("telegramUserId") WHERE "telegramUserId" IS NOT NULL;
    ALTER TABLE "Service" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "Material" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "SupplierPoint" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "SupplierMaterialOffer" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "TrackerDevice" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "TrackerMessage" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "TrackerStop" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "TrackerDailyStat" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "CustomerRequest" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "CustomerRequestItem" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "CustomerAccount" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "CustomerContactVerification" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "CustomerSession" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "CustomerRequestAccountLink" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "Employee" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "EmployeeTelegramCandidate" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "EmployeeTelegramCandidate" ADD COLUMN IF NOT EXISTS "adminId" TEXT;
    DO $$ BEGIN
      ALTER TABLE "EmployeeTelegramCandidate"
      ADD CONSTRAINT "EmployeeTelegramCandidate_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    ALTER TABLE "WorkAssignment" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "WorkExecutionSession" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "WorkExecutionReport" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "WorkExecutionReport" ADD COLUMN IF NOT EXISTS "questionnaireStep" TEXT NOT NULL DEFAULT 'NOT_STARTED';
    ALTER TABLE "WorkExecutionReport" ADD COLUMN IF NOT EXISTS "questionnaireStatus" TEXT NOT NULL DEFAULT 'PENDING';
    ALTER TABLE "WorkExecutionReport" ADD COLUMN IF NOT EXISTS "awaitingTextField" TEXT;
    ALTER TABLE "WorkExecutionReport" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ;
    ALTER TABLE "WorkExecutionReport" ADD COLUMN IF NOT EXISTS "extraExpensesType" TEXT;
    ALTER TABLE "WorkExecutionReport" ADD COLUMN IF NOT EXISTS "workCompleted" BOOLEAN;
    ALTER TABLE "WorkExecutionReport" ADD COLUMN IF NOT EXISTS "needsNextShift" BOOLEAN;
    ALTER TABLE "WorkExecutionReport" ADD COLUMN IF NOT EXISTS "nextShiftComment" TEXT;
    ALTER TABLE "OrderEventLog" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "NotificationOutbox" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "NotificationTemplate" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "PriceItemTemplate" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "OrderPriceItem" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "OrderPayment" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "OrderExpense" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "WorkerCompensation" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "EmployeeSettlement" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);
    ALTER TABLE "EmployeeSettlement" ADD COLUMN IF NOT EXISTS "fromEmployeeId" TEXT;
    ALTER TABLE "EmployeeSettlement" ADD COLUMN IF NOT EXISTS "toEmployeeId" TEXT;
    DO $$ BEGIN
      ALTER TABLE "EmployeeSettlement"
      ADD CONSTRAINT "EmployeeSettlement_fromEmployeeId_fkey"
      FOREIGN KEY ("fromEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "EmployeeSettlement"
      ADD CONSTRAINT "EmployeeSettlement_toEmployeeId_fkey"
      FOREIGN KEY ("toEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    ALTER TABLE "EquipmentExpense" ALTER COLUMN "id" SET DEFAULT md5(random()::text || clock_timestamp()::text);

    CREATE INDEX IF NOT EXISTS "RentOrder_paymentStatus_idx" ON "RentOrder"("paymentStatus");
    CREATE INDEX IF NOT EXISTS "RentOrder_workerSettlementStatus_idx" ON "RentOrder"("workerSettlementStatus");
    CREATE INDEX IF NOT EXISTS "EmployeeSettlement_fromEmployeeId_idx" ON "EmployeeSettlement"("fromEmployeeId");
    CREATE INDEX IF NOT EXISTS "EmployeeSettlement_toEmployeeId_idx" ON "EmployeeSettlement"("toEmployeeId");

    INSERT INTO "PriceItemTemplate" (
      "title",
      "calculationType",
      "defaultUnit",
      "defaultUnitPrice",
      "sortOrder",
      "updatedAt"
    )
    VALUES
      ('Доставка техніки', 'per_km', 'км', 60, 10, NOW()),
      ('Подача евакуатора', 'per_km', 'км', 35, 20, NOW()),
      ('Евакуація авто', 'per_km', 'км', 35, 30, NOW()),
      ('Завантаження авто на евакуатор', 'fixed', 'шт', 500, 40, NOW()),
      ('Робота техніки', 'per_hour', 'год', 1200, 50, NOW()),
      ('Зміна техніки', 'per_shift', 'зміна', 8000, 60, NOW()),
      ('Простій', 'per_hour', 'год', 600, 70, NOW())
    ON CONFLICT ("title","calculationType") DO NOTHING;

    -- Backfill legacy rental requests into CustomerRequest
    INSERT INTO "CustomerRequest" (
      "source",
      "requestType",
      "status",
      "customerName",
      "phone",
      "email",
      "addressFrom",
      "comment",
      "legacyOrderId",
      "createdAt",
      "updatedAt",
      "metadata"
    )
    SELECT
      'site',
      'equipment_rental',
      o."status"::TEXT,
      o."customerName",
      o."phone",
      o."email",
      o."address",
      o."comment",
      o."id",
      o."createdAt",
      o."updatedAt",
      jsonb_build_object(
        'equipmentId', o."equipmentId",
        'dateFrom', o."dateFrom",
        'dateTo', o."dateTo"
      )
    FROM "Order" o
    WHERE NOT EXISTS (
      SELECT 1
      FROM "CustomerRequest" cr
      WHERE cr."legacyOrderId" = o."id"
    );

    INSERT INTO "CustomerRequestItem" (
      "requestId",
      "itemType",
      "refId",
      "titleSnapshot",
      "quantity",
      "unit"
    )
    SELECT
      cr."id",
      'equipment',
      o."equipmentId",
      COALESCE(e."name", 'Оренда техніки'),
      1,
      'шт'
    FROM "CustomerRequest" cr
    INNER JOIN "Order" o ON o."id" = cr."legacyOrderId"
    LEFT JOIN "Equipment" e ON e."id" = o."equipmentId"
    WHERE o."equipmentId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "CustomerRequestItem" cri
        WHERE cri."requestId" = cr."id"
      );

    -- Backfill legacy service requests into CustomerRequest
    INSERT INTO "CustomerRequest" (
      "source",
      "requestType",
      "status",
      "customerName",
      "phone",
      "addressFrom",
      "scheduledDate",
      "scheduledTime",
      "comment",
      "legacyServiceRequestId",
      "createdAt",
      "updatedAt",
      "metadata"
    )
    SELECT
      'site',
      'service',
      sr."status"::TEXT,
      sr."customerName",
      sr."phone",
      sr."address",
      sr."date",
      sr."time",
      sr."comment",
      sr."id",
      sr."createdAt",
      sr."updatedAt",
      jsonb_build_object('serviceType', sr."serviceType")
    FROM "ServiceRequest" sr
    WHERE NOT EXISTS (
      SELECT 1
      FROM "CustomerRequest" cr
      WHERE cr."legacyServiceRequestId" = sr."id"
    );

    INSERT INTO "CustomerRequestItem" (
      "requestId",
      "itemType",
      "refId",
      "titleSnapshot",
      "quantity",
      "unit"
    )
    SELECT
      cr."id",
      'service',
      s."slug",
      COALESCE(
        s."title",
        CASE
          WHEN sr."serviceType" = 'debris_removal' THEN 'Вивіз будівельного сміття'
          ELSE initcap(replace(sr."serviceType", '_', ' '))
        END
      ),
      1,
      'послуга'
    FROM "CustomerRequest" cr
    INNER JOIN "ServiceRequest" sr ON sr."id" = cr."legacyServiceRequestId"
    LEFT JOIN "Service" s ON s."slug" = sr."serviceType"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "CustomerRequestItem" cri
      WHERE cri."requestId" = cr."id"
    );
  `);

  for (const value of ["tow_calculator", "material_delivery_calculator"]) {
    try {
      await pool.query(`ALTER TYPE "PricingType" ADD VALUE '${value}'`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("already exists")) {
        throw error;
      }
    }
  }

  console.log("Schema initialized.");
}
