const readline = require("node:readline");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ask(interfaceInstance, prompt) {
  return new Promise((resolve) => {
    interfaceInstance.question(prompt, resolve);
  });
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return Promise.reject(new Error("Run this command in an interactive terminal."));
  }

  return new Promise((resolve, reject) => {
    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(prompt);
    let value = "";

    function cleanup() {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.setRawMode(wasRaw);
      process.stdout.write("\n");
    }

    function onKeypress(character, key = {}) {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(value);
        return;
      }
      if (key.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }
      if (!key.ctrl && !key.meta && typeof character === "string") {
        value += character;
      }
    }

    process.stdin.on("keypress", onKeypress);
  });
}

async function createPrivilegedUser() {
  const prompts = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const prisma = new PrismaClient();

  try {
    const role = (await ask(prompts, "Account role (ADMIN or MANAGER): "))
      .trim()
      .toUpperCase();
    if (!["ADMIN", "MANAGER"].includes(role)) {
      throw new Error("Role must be ADMIN or MANAGER.");
    }

    const name = (await ask(prompts, "Name: ")).trim();
    if (!name || name.length > 100) {
      throw new Error("Name must be between 1 and 100 characters.");
    }

    const email = (await ask(prompts, "Email: ")).trim().toLowerCase();
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    prompts.close();
    const password = await readHidden("Password (input hidden): ");
    const confirmation = await readHidden("Confirm password (input hidden): ");
    if (Array.from(password).length < 8 || Buffer.byteLength(password, "utf8") > 1024) {
      throw new Error("Password must be at least 8 characters and at most 1024 UTF-8 bytes.");
    }
    if (password !== confirmation) {
      throw new Error("Passwords do not match.");
    }

    await prisma.$connect();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({
        where: { email },
        data: {
          name,
          role,
          passwordHash: await bcrypt.hash(password, 12),
          emailVerifiedAt: existing.emailVerifiedAt || new Date()
        }
      });
      console.log(`${role} account password and details updated for ${email} in the database configured for NestJS.`);
      return;
    }

    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role,
        emailVerifiedAt: new Date()
      }
    });
    console.log(`${role} account created in the database configured for NestJS.`);
  } finally {
    prompts.close();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  createPrivilegedUser().catch((error) => {
    console.error(`Could not create privileged account: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createPrivilegedUser, readHidden };
