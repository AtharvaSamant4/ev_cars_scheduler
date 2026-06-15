-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RESIDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Society" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Society_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flat" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Flat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "flatId" UUID,
    "role" "UserRole" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "passwordHash" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_role_flat_check" CHECK (
        ("role" = 'RESIDENT' AND "flatId" IS NOT NULL)
        OR ("role" = 'ADMIN' AND "flatId" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "registrationNumber" VARCHAR(32) NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlatQuota" (
    "id" UUID NOT NULL,
    "flatId" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "allocatedMinutes" INTEGER NOT NULL,
    "usedMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FlatQuota_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FlatQuota_year_check" CHECK ("year" BETWEEN 2020 AND 2100),
    CONSTRAINT "FlatQuota_bounds_check" CHECK (
        "allocatedMinutes" >= 0
        AND "usedMinutes" >= 0
        AND "usedMinutes" <= "allocatedMinutes"
    )
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "flatId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quotaYear" SMALLINT NOT NULL,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Booking_valid_interval_check" CHECK ("endTime" > "startTime"),
    CONSTRAINT "Booking_positive_duration_check" CHECK ("durationMinutes" > 0),
    CONSTRAINT "Booking_cancelled_at_check" CHECK (
        ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
        OR ("status" <> 'CANCELLED' AND "cancelledAt" IS NULL)
    ),
    CONSTRAINT "Booking_vehicle_no_overlap" EXCLUDE USING gist (
        "vehicleId" WITH =,
        tstzrange("startTime", "endTime", '[)') WITH &&
    ) WHERE ("status" <> 'CANCELLED')
);

-- CreateIndex
CREATE INDEX "Flat_societyId_isActive_idx" ON "Flat"("societyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Flat_societyId_number_key" ON "Flat"("societyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "User_flatId_key" ON "User"("flatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_societyId_role_isActive_idx" ON "User"("societyId", "role", "isActive");

-- CreateIndex
CREATE INDEX "Vehicle_societyId_status_idx" ON "Vehicle"("societyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_societyId_registrationNumber_key" ON "Vehicle"("societyId", "registrationNumber");

-- CreateIndex
CREATE INDEX "FlatQuota_year_idx" ON "FlatQuota"("year");

-- CreateIndex
CREATE UNIQUE INDEX "FlatQuota_flatId_year_key" ON "FlatQuota"("flatId", "year");

-- CreateIndex
CREATE INDEX "Booking_societyId_status_startTime_idx" ON "Booking"("societyId", "status", "startTime");

-- CreateIndex
CREATE INDEX "Booking_vehicleId_startTime_endTime_idx" ON "Booking"("vehicleId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_flatId_createdAt_idx" ON "Booking"("flatId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_societyId_fkey"
FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_societyId_fkey"
FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_flatId_fkey"
FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_societyId_fkey"
FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlatQuota" ADD CONSTRAINT "FlatQuota_flatId_fkey"
FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_societyId_fkey"
FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vehicleId_fkey"
FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_flatId_fkey"
FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
