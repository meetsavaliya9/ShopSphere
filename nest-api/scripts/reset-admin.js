const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function resetAdmin() {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || "admin@gmail.com").trim().toLowerCase();
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || "Admin@123";
  const name = process.argv[4] || process.env.ADMIN_NAME || "Admin";

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        name,
        role: "ADMIN",
        emailVerifiedAt: new Date()
      },
      create: {
        email,
        name,
        passwordHash,
        role: "ADMIN",
        emailVerifiedAt: new Date()
      }
    });

    // Revoke any previous sessions so clean login is required
    await prisma.session.deleteMany({ where: { userId: user.id } });

    console.log(`[SUCCESS] Admin account configured:`);
    console.log(`Email:    ${user.email}`);
    console.log(`Role:     ${user.role}`);
    console.log(`Password: ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  resetAdmin().catch((err) => {
    console.error(`[ERROR] Could not reset admin: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { resetAdmin };
