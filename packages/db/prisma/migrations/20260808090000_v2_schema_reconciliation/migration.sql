-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT', 'BOOKING_DEBIT', 'REFUND', 'PENALTY', 'RECHARGE');

-- CreateEnum
CREATE TYPE "ReassignReason" AS ENUM ('LATE_RETURN', 'BREAKDOWN', 'MAINTENANCE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "RechargeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'DRIVER_ASSIGNED' AFTER 'BOOKED';
ALTER TYPE "BookingStatus" ADD VALUE 'OTP_PENDING' AFTER 'DRIVER_ASSIGNED';
ALTER TYPE "BookingStatus" ADD VALUE 'IN_PROGRESS' AFTER 'OTP_PENDING';
ALTER TYPE "BookingStatus" ADD VALUE 'ACTIVE' AFTER 'IN_PROGRESS';
ALTER TYPE "BookingStatus" ADD VALUE 'REASSIGNED' AFTER 'CANCELLED';
ALTER TYPE "BookingStatus" ADD VALUE 'AT_RISK' AFTER 'REASSIGNED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'DRIVER';

-- AlterEnum
ALTER TYPE "VehicleStatus" ADD VALUE 'BREAKDOWN';

-- Replace the annual FlatQuota indexes after the weekly column is populated.
DROP INDEX "FlatQuota_flatId_year_key";
DROP INDEX "FlatQuota_year_idx";

-- AlterTable
-- quotaWeek is introduced as nullable so an upgrade with legacy bookings can be
-- backfilled deterministically before the target NOT NULL constraint is applied.
ALTER TABLE "Booking"
ADD COLUMN "actualEndTime" TIMESTAMPTZ(3),
ADD COLUMN "actualRideStartTime" TIMESTAMPTZ(3),
ADD COLUMN "driverId" UUID,
ADD COLUMN "otp" VARCHAR(6),
ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "otpExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN "otpGeneratedAt" TIMESTAMPTZ(3),
ADD COLUMN "otpVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "otpVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN "quotaWeek" SMALLINT,
ADD COLUMN "reassignedAt" TIMESTAMPTZ(3),
ADD COLUMN "reassignedByUserId" UUID,
ADD COLUMN "reassignedReason" "ReassignReason",
ADD COLUMN "reassignedVehicleId" UUID,
ADD COLUMN "startedAt" TIMESTAMPTZ(3);

UPDATE "Booking" AS booking
SET
    "quotaYear" = EXTRACT(
        ISOYEAR FROM (booking."startTime" AT TIME ZONE society."timezone")
    )::SMALLINT,
    "quotaWeek" = EXTRACT(
        WEEK FROM (booking."startTime" AT TIME ZONE society."timezone")
    )::SMALLINT
FROM "Society" AS society
WHERE society."id" = booking."societyId";

ALTER TABLE "Booking" ALTER COLUMN "quotaWeek" SET NOT NULL;

-- AlterTable
-- The old migration stored one annual quota row. There is no committed rule for
-- distributing that historical aggregate, so legacy rows are preserved in a
-- deterministic week-1 bucket instead of being multiplied across 52/53 weeks.
ALTER TABLE "FlatQuota" ADD COLUMN "weekNumber" SMALLINT;
UPDATE "FlatQuota" SET "weekNumber" = 1;
ALTER TABLE "FlatQuota" ALTER COLUMN "weekNumber" SET NOT NULL;

-- AlterTable
ALTER TABLE "Vehicle"
ADD COLUMN "expectedReturnDate" TIMESTAMPTZ(3),
ADD COLUMN "hourlyRate" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "isReserve" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maintenanceReason" TEXT;

-- CreateTable
CREATE TABLE "Driver" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "fullName" VARCHAR(120) NOT NULL,
    "phoneNumber" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "licenseNumber" VARCHAR(50) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "vehicleId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "bookingId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReassignmentLog" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "originalVehicleId" UUID NOT NULL,
    "newVehicleId" UUID NOT NULL,
    "reassignedByUserId" UUID NOT NULL,
    "reason" "ReassignReason" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReassignmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenaltyRule" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "amount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PenaltyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "penaltyRuleId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RechargeRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RechargeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "approvedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RechargeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "penaltyAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_phoneNumber_key" ON "Driver"("phoneNumber");
CREATE UNIQUE INDEX "Driver_licenseNumber_key" ON "Driver"("licenseNumber");
CREATE INDEX "Driver_societyId_isActive_idx" ON "Driver"("societyId", "isActive");
CREATE INDEX "Driver_vehicleId_idx" ON "Driver"("vehicleId");
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");
CREATE INDEX "ReassignmentLog_bookingId_createdAt_idx" ON "ReassignmentLog"("bookingId", "createdAt");
CREATE UNIQUE INDEX "PenaltyRule_societyId_code_key" ON "PenaltyRule"("societyId", "code");
CREATE INDEX "Penalty_bookingId_idx" ON "Penalty"("bookingId");
CREATE UNIQUE INDEX "Penalty_bookingId_penaltyRuleId_key" ON "Penalty"("bookingId", "penaltyRuleId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "RechargeRequest_userId_createdAt_idx" ON "RechargeRequest"("userId", "createdAt");
CREATE INDEX "RechargeRequest_status_createdAt_idx" ON "RechargeRequest"("status", "createdAt");
CREATE UNIQUE INDEX "Invoice_bookingId_key" ON "Invoice"("bookingId");
CREATE INDEX "FlatQuota_year_weekNumber_idx" ON "FlatQuota"("year", "weekNumber");
CREATE UNIQUE INDEX "FlatQuota_flatId_year_weekNumber_key" ON "FlatQuota"("flatId", "year", "weekNumber");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_reassignedVehicleId_fkey" FOREIGN KEY ("reassignedVehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_reassignedByUserId_fkey" FOREIGN KEY ("reassignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReassignmentLog" ADD CONSTRAINT "ReassignmentLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReassignmentLog" ADD CONSTRAINT "ReassignmentLog_originalVehicleId_fkey" FOREIGN KEY ("originalVehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReassignmentLog" ADD CONSTRAINT "ReassignmentLog_newVehicleId_fkey" FOREIGN KEY ("newVehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReassignmentLog" ADD CONSTRAINT "ReassignmentLog_reassignedByUserId_fkey" FOREIGN KEY ("reassignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PenaltyRule" ADD CONSTRAINT "PenaltyRule_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_penaltyRuleId_fkey" FOREIGN KEY ("penaltyRuleId") REFERENCES "PenaltyRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RechargeRequest" ADD CONSTRAINT "RechargeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RechargeRequest" ADD CONSTRAINT "RechargeRequest_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
