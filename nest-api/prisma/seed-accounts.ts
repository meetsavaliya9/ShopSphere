
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_BYTES = 1024;

type PrivilegedRole = "ADMIN" | "MANAGER";

type SeedAccount = {
  name: string;
  email: string;
  password: string;
  role: PrivilegedRole;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable ${name} is missing.`);
  return value;
}

function readAccount(role: PrivilegedRole): SeedAccount {
  const prefix = role === "ADMIN" ? "ADMIN" : "MANAGER";
  const name = requiredEnv(`${prefix}_NAME`);
  const email = requiredEnv(`${prefix}_EMAIL`).toLowerCase();
  const password = process.env[`${prefix}_PASSWORD`];

  if (name.length > 100) {
    throw new Error(`${prefix}_NAME must be at most 100 characters.`);
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Error(`${prefix}_EMAIL must be a valid email address.`);
  }
  if (
    typeof password !== "string" ||
    Array.from(password).length < 8 ||
    Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
  ) {
    throw new Error(`${prefix}_PASSWORD must be at least 8 characters and at most 1024 UTF-8 bytes.`);
  }

  return { name, email, password, role };
}

function getExpectedDatabaseTarget() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const expectedHost = requiredEnv("EXPECTED_DATABASE_HOST").toLowerCase();
  const expectedDatabase = requiredEnv("EXPECTED_DATABASE_NAME");
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid MySQL URL.");
  }

  const databaseFromUrl = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
  if (
    parsedUrl.protocol !== "mysql:" ||
    parsedUrl.hostname.toLowerCase() !== expectedHost ||
    databaseFromUrl !== expectedDatabase
  ) {
    throw new Error("DATABASE_URL does not match EXPECTED_DATABASE_HOST and EXPECTED_DATABASE_NAME.");
  }

  return { expectedDatabase, expectedHost };
}

async function verifyConnectedDatabase(target: ReturnType<typeof getExpectedDatabaseTarget>) {
  await prisma.$connect();
  const rows = await prisma.$queryRaw<Array<{ databaseName: string | null }>>`
    SELECT DATABASE() AS databaseName
  `;
  if (rows[0]?.databaseName !== target.expectedDatabase) {
    throw new Error("Connected database does not match EXPECTED_DATABASE_NAME; no accounts were changed.");
  }
  console.log(`Verified database target: ${target.expectedHost}/${rows[0].databaseName}`);
}

async function confirmDatabaseTarget(target: ReturnType<typeof getExpectedDatabaseTarget>) {
  if (!process.stdin.isTTY) {
    throw new Error("Run the account seed in an interactive terminal to confirm the database target.");
  }

  const expectedConfirmation = `SEED ${target.expectedHost}/${target.expectedDatabase}`;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const confirmation = await prompt.question(`Type ${expectedConfirmation} to create missing accounts: `);
    if (confirmation !== expectedConfirmation) {
      throw new Error("Database target confirmation did not match; no accounts were changed.");
    }
  } finally {
    prompt.close();
  }
}

async function main() {
  const accounts = [readAccount("ADMIN"), readAccount("MANAGER")];
  const target = getExpectedDatabaseTarget();

  if (
    accounts[0].email === accounts[1].email
  ) {
    throw new Error("Admin and Manager must use different email addresses.");
  }

  await verifyConnectedDatabase(target);
  await confirmDatabaseTarget(target);

  const states = await Promise.all(accounts.map(async (account) => ({
    account,
    existing: await prisma.user.findUnique({
      where: { email: account.email },
      select: { role: true }
    })
  })));

  const conflict = states.find(({ account, existing }) =>
    existing && existing.role !== account.role
  );
  if (conflict) {
    throw new Error(
      `Cannot seed ${conflict.account.role}: that email already has role ${conflict.existing?.role}. No accounts were changed.`
    );
  }

  for (const { account, existing } of states) {
    if (existing) {
      console.log(`${account.role} account already exists; skipped without changes.`);
      continue;
    }

    await prisma.user.create({
      data: {
        name: account.name,
        email: account.email,
        passwordHash: await bcrypt.hash(account.password, 12),
        role: account.role,
        emailVerifiedAt: new Date()
      }
    });
    console.log(`${account.role} account created.`);
  }
}

function safeErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : "Unexpected error.";
  for (const name of ["ADMIN_PASSWORD", "MANAGER_PASSWORD", "DATABASE_URL"]) {
    const secret = process.env[name];
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message.replace(/mysql:\/\/[^\s]+/gi, "mysql://[REDACTED]");
}

main()
  .catch((error) => {
    console.error("Account seeding failed:", safeErrorMessage(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
