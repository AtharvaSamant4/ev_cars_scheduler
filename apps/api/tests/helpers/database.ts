import { prisma } from "@society-ev/db";

const SAFE_TEST_DATABASE = /^society_ev_recovery_[a-z0-9_]*test(?:_[a-z0-9_]*)?$/;

export function assertSafeTestDatabase() {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL]
    .filter((value): value is string => Boolean(value));

  if (urls.length === 0) {
    throw new Error("Database tests require an explicit local recovery test URL");
  }

  for (const value of urls) {
    const url = new URL(value);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (
      (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") ||
      url.port !== "55432" ||
      url.username !== "society_ev_recovery" ||
      !SAFE_TEST_DATABASE.test(database)
    ) {
      throw new Error(
        `Refusing database test target ${url.hostname}:${url.port}/${database}; expected the loopback recovery instance and a society_ev_recovery_*test* database`,
      );
    }
  }
}

export async function cleanupSocietyFixture(societyId: string) {
  await prisma.$transaction([
    prisma.invoice.deleteMany({ where: { booking: { societyId } } }),
    prisma.penalty.deleteMany({ where: { booking: { societyId } } }),
    prisma.reassignmentLog.deleteMany({ where: { booking: { societyId } } }),
    prisma.notification.deleteMany({ where: { user: { societyId } } }),
    prisma.walletTransaction.deleteMany({ where: { wallet: { user: { societyId } } } }),
    prisma.rechargeRequest.deleteMany({ where: { user: { societyId } } }),
    prisma.booking.deleteMany({ where: { societyId } }),
    prisma.wallet.deleteMany({ where: { user: { societyId } } }),
    prisma.driver.deleteMany({ where: { societyId } }),
    prisma.penaltyRule.deleteMany({ where: { societyId } }),
    prisma.flatQuota.deleteMany({ where: { flat: { societyId } } }),
    prisma.user.deleteMany({ where: { societyId } }),
    prisma.vehicle.deleteMany({ where: { societyId } }),
    prisma.flat.deleteMany({ where: { societyId } }),
  ]);
  await prisma.society.delete({ where: { id: societyId } });
}

assertSafeTestDatabase();
