-- The original role/flat check predates DRIVER. Residents must own a flat;
-- administrative and driver login accounts must not.
ALTER TABLE "User" DROP CONSTRAINT "User_role_flat_check";
ALTER TABLE "User" ADD CONSTRAINT "User_role_flat_check" CHECK (
    ("role" = 'RESIDENT' AND "flatId" IS NOT NULL)
    OR ("role" IN ('ADMIN', 'DRIVER') AND "flatId" IS NULL)
);

-- ISO week bounds are PostgreSQL-only checks not representable in Prisma's
-- schema language.
ALTER TABLE "FlatQuota" ADD CONSTRAINT "FlatQuota_week_number_check"
CHECK ("weekNumber" BETWEEN 1 AND 53);

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_quota_week_check"
CHECK ("quotaWeek" BETWEEN 1 AND 53);

-- timestamptz + interval is classified STABLE by PostgreSQL because generic
-- intervals can depend on time-zone rules. This fixed-minute wrapper is safe to
-- mark IMMUTABLE and allows the expression to participate in a GiST exclusion
-- constraint.
CREATE FUNCTION booking_buffer_end(value TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
RETURN value + INTERVAL '30 minutes';

-- Expand only the end of each reservation. With [) ranges this enforces a
-- 30-minute turnaround while allowing a booking that begins exactly 30 minutes
-- after the preceding booking ends.
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_vehicle_no_overlap";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vehicle_no_overlap" EXCLUDE USING gist (
    "vehicleId" WITH =,
    tstzrange("startTime", booking_buffer_end("endTime"), '[)') WITH &&
) WHERE ("status" <> 'CANCELLED');

-- Reassigned reserve vehicles receive the same buffer for conflicts against
-- other reassigned bookings. Cross-column vehicleId/reassignedVehicleId
-- conflicts remain application-enforced; PostgreSQL cannot express that pair
-- safely as a single declarative exclusion constraint without changing the
-- original-vehicle reservation semantics.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_reassigned_vehicle_no_overlap" EXCLUDE USING gist (
    "reassignedVehicleId" WITH =,
    tstzrange("startTime", booking_buffer_end("endTime"), '[)') WITH &&
) WHERE ("status" <> 'CANCELLED' AND "reassignedVehicleId" IS NOT NULL);
