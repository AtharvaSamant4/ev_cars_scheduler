import { AdminPortal } from "@/src/admin/admin-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AffectedBookingsPage() {
  return <AdminPortal section="affected-bookings" />;
}
