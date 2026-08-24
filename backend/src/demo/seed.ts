import { prisma } from "../db/prisma.js";
import { seedDemoData } from "./seedData.js";

seedDemoData()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
