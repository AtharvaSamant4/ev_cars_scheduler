import { AdminPortal } from "@/src/admin/admin-portal";

const sections = new Set([
  "dashboard",
  "vehicles",
  "flats",
  "residents",
  "quota",
  "bookings",
  "vehicle-status",
  "drivers",
  "wallets",
  "society-qr",
  "recharge-requests",
  "cancellation-settings",
  "affected-bookings",
]);

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <AdminPortal section={sections.has(section) ? section : "dashboard"} />;
}
