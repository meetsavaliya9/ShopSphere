const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const productCols = await prisma.$queryRawUnsafe("SHOW COLUMNS FROM product");
  console.log("product columns:", productCols.map(c => c.Field));
  const categoryCols = await prisma.$queryRawUnsafe("SHOW COLUMNS FROM category");
  console.log("category columns:", categoryCols.map(c => c.Field));
  const recentProducts = await prisma.product.findMany({ take: 3, select: { id: true, name: true, imageUrl: true } });
  console.log("sample products:", recentProducts);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
