import { prisma } from "@society-ev/db";

async function main() {
  const societies = await prisma.society.findMany();
  
  for (const society of societies) {
    await prisma.penaltyRule.upsert({
      where: {
        societyId_code: {
          societyId: society.id,
          code: "LATE_RETURN_PER_HOUR"
        }
      },
      update: {},
      create: {
        societyId: society.id,
        name: "Late Return Penalty",
        code: "LATE_RETURN_PER_HOUR",
        amount: 100, // Rs 100 per hour
        description: "Penalty charged per hour for returning the vehicle late."
      }
    });
    console.log(`Ensured LATE_RETURN_PER_HOUR rule for society ${society.name}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
