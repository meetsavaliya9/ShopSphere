
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function createAccount(data: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "MANAGER";
}) {
  const email = data.email.trim().toLowerCase();

  if (!email || !data.password) {
    throw new Error(`Missing credentials for ${data.role}`);
  }

//   if (data.password.length < 12) {
//     throw new Error(
//       `${data.role} password must be at least 12 characters`
//     );
//   }

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    if (existing.role !== data.role) {
      throw new Error(
        `${email} already exists with role ${existing.role}. ` +
        `No changes were made.`
      );
    }

    console.log(`${data.role} account already exists; skipped.`);
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  await prisma.user.create({
    data: {
      name: data.name,
      email,
      passwordHash,
      role: data.role,
    },
  });

  console.log(`${data.role} account created: ${email}`);
}

async function main() {
  const adminName = process.env.ADMIN_NAME;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  const managerName = process.env.MANAGER_NAME;
  const managerEmail = process.env.MANAGER_EMAIL;
  const managerPassword = process.env.MANAGER_PASSWORD;

  if (
    !adminName ||
    !adminEmail ||
    !adminPassword ||
    !managerName ||
    !managerEmail ||
    !managerPassword
  ) {
    throw new Error(
      "Admin/Manager environment variables are missing."
    );
  }

  if (
    adminEmail.trim().toLowerCase() ===
    managerEmail.trim().toLowerCase()
  ) {
    throw new Error(
      "Admin and Manager must use different email addresses."
    );
  }

  await createAccount({
    name: adminName,
    email: adminEmail,
    password: adminPassword,
    role: "ADMIN",
  });

  await createAccount({
    name: managerName,
    email: managerEmail,
    password: managerPassword,
    role: "MANAGER",
  });
}

main()
  .catch((error) => {
    console.error("Account seeding failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
