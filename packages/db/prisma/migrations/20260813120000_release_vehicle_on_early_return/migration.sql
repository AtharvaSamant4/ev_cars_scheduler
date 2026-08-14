-- Until now a vehicle stayed reserved for its whole scheduled window even after
-- the trip finished, so returning a car early did not make it available to
-- anyone else. The reservation should follow the vehicle, not the calendar.
--
-- LEAST() ignores NULLs, so a booking that has not completed keeps its
-- scheduled end and behaves exactly as before. GREATEST() against the start
-- guards the historical rows whose actualEndTime predates their startTime --
-- those exist from before trips were confined to their booked window, and
-- without the guard tstzrange() would reject an inverted range outright.
--
-- The effective end can only ever move earlier, never later, so every reserved
-- range is a subset of what it was. No currently valid row can begin to
-- conflict, which is what allows this constraint to be swapped in place.
CREATE FUNCTION booking_effective_end(
    start_time TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    actual_end TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
RETURN GREATEST(start_time, LEAST(actual_end, scheduled_end)) + INTERVAL '30 minutes';

ALTER TABLE "Booking" DROP CONSTRAINT "Booking_vehicle_no_overlap";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vehicle_no_overlap" EXCLUDE USING gist (
    "vehicleId" WITH =,
    tstzrange(
        "startTime",
        booking_effective_end("startTime", "endTime", "actualEndTime"),
        '[)'
    ) WITH &&
) WHERE ("status" <> 'CANCELLED');

ALTER TABLE "Booking" DROP CONSTRAINT "Booking_reassigned_vehicle_no_overlap";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_reassigned_vehicle_no_overlap" EXCLUDE USING gist (
    "reassignedVehicleId" WITH =,
    tstzrange(
        "startTime",
        booking_effective_end("startTime", "endTime", "actualEndTime"),
        '[)'
    ) WITH &&
) WHERE ("status" <> 'CANCELLED' AND "reassignedVehicleId" IS NOT NULL);
