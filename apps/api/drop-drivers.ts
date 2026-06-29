import { prisma } from "@society-ev/db";

async function main() {
  await prisma.driver.deleteMany({});
  console.log("Deleted all drivers");
}

main().catch(console.error).finally(() => prisma.$disconnect());
