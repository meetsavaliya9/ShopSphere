const {
  BadRequestException,
  Injectable,
  Inject,
  NotFoundException
} = require("@nestjs/common");
const { PrismaService } = require("../prisma/prisma.service");
const { productView } = require("../products/product.service");
const { requireCustomerPermission } = require("../auth/customer-permissions");

class WishlistService {
  constructor(prismaService) {
    this.prisma = prismaService.client;
  }

  async list(userId) {
    await requireCustomerPermission(this.prisma, userId, "VIEW_WISHLIST");
    const entries = await this.prisma.wishlistitem.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: "desc" }
    });
    return { items: entries.map(({ product }) => productView(product)) };
  }

  async add(userId, input) {
    await requireCustomerPermission(this.prisma, userId, "ADD_TO_WISHLIST");
    const productId = this.validateProductId(input?.productId);
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found.");
    try {
      await this.prisma.wishlistitem.create({ data: { userId, productId } });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
    return this.list(userId);
  }

  async remove(userId, productId) {
    await requireCustomerPermission(this.prisma, userId, "REMOVE_FROM_WISHLIST");
    const validId = this.validateProductId(productId);
    const result = await this.prisma.wishlistitem.deleteMany({
      where: { userId, productId: validId }
    });
    if (!result.count) throw new NotFoundException("Favorite not found.");
    return this.list(userId);
  }

  validateProductId(productId) {
    const numericId = typeof productId === "number"
      ? productId
      : typeof productId === "string" && /^[1-9]\d*$/.test(productId)
        ? Number(productId)
        : NaN;
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    return numericId;
  }
}

Inject(PrismaService)(WishlistService, undefined, 0);
Injectable()(WishlistService);

module.exports = { WishlistService };
