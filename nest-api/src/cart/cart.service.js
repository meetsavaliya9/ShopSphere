const {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException
} = require("@nestjs/common");
const { PrismaService } = require("../prisma/prisma.service");
const { productView } = require("../products/product.service");
const { requireCustomerPermission } = require("../auth/customer-permissions");

class CartService {
  constructor(prismaService) {
    this.prisma = prismaService.client;
  }

  async get(userId) {
    await requireCustomerPermission(this.prisma, userId, "VIEW_CART");
    await this.prisma.cart.upsert({
      where: { userId },
      create: { userId, updatedAt: new Date() },
      update: {}
    });
    return this.read(userId);
  }

  async add(userId, input) {
    await requireCustomerPermission(this.prisma, userId, "ADD_TO_CART");
    const { productId, quantity } = this.validateItem(input);
    return this.prisma.$transaction(async (transaction) => {
      const product = await this.availableProduct(transaction, productId);
      const cart = await transaction.cart.upsert({
        where: { userId },
        create: { userId, updatedAt: new Date() },
        update: {}
      });
      const current = await transaction.cartitem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } }
      });
      const nextQuantity = (current?.quantity || 0) + quantity;
      if (nextQuantity > 99 || nextQuantity > product.stockQuantity) {
        throw new ConflictException(
          `Only ${product.stockQuantity} unit${product.stockQuantity === 1 ? "" : "s"} of this product are currently available.`
        );
      }
      await transaction.cartitem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        create: {
          cartId: cart.id,
          productId,
          quantity: nextQuantity,
          updatedAt: new Date()
        },
        update: { quantity: nextQuantity, updatedAt: new Date() }
      });
      return this.read(userId, transaction);
    }, { isolationLevel: "Serializable" });
  }

  async update(userId, productId, input) {
    await requireCustomerPermission(this.prisma, userId, "UPDATE_CART_QUANTITY");
    const { productId: normalizedProductId, quantity } = this.validateItem({ ...input, productId });
    return this.prisma.$transaction(async (transaction) => {
      const cart = await transaction.cart.findUnique({ where: { userId } });
      if (!cart) throw new NotFoundException("Cart item not found.");
      const where = {
        cartId_productId: { cartId: cart.id, productId: normalizedProductId }
      };
      const current = await transaction.cartitem.findUnique({ where });
      if (!current) throw new NotFoundException("Cart item not found.");
      const product = await transaction.product.findUnique({
        where: { id: normalizedProductId }
      });
      if (!product) throw new NotFoundException("Product not found.");
      if (quantity > 99) {
        throw new ConflictException("The requested quantity is not available.");
      }
      if (quantity > current.quantity) {
        if (!product.inStock) {
          throw new ConflictException("This product is unavailable.");
        }
        if (product.stockQuantity === null || quantity > product.stockQuantity) {
          const available = product.stockQuantity ?? 0;
          throw new ConflictException(
            `Only ${available} unit${available === 1 ? "" : "s"} of this product are currently available.`
          );
        }
      }
      const updated = await transaction.cartitem.updateMany({
        where: {
          cartId: cart.id,
          productId: normalizedProductId,
          quantity: current.quantity
        },
        data: { quantity, updatedAt: new Date() }
      });
      if (!updated.count) {
        throw new ConflictException("Your cart changed concurrently. Refresh and try again.");
      }
      return this.read(userId, transaction);
    }, { isolationLevel: "Serializable" });
  }

  async remove(userId, productId) {
    await requireCustomerPermission(this.prisma, userId, "REMOVE_CART_ITEMS");
    productId = this.validateProductId(productId);
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException("Cart item not found.");
    const deleted = await this.prisma.cartitem.deleteMany({
      where: { cartId: cart.id, productId }
    });
    if (!deleted.count) throw new NotFoundException("Cart item not found.");
    return this.read(userId);
  }

  async read(userId, client = this.prisma) {
    const cart = await client.cart.findUnique({
      where: { userId },
      include: {
        cartitem: {
          include: {
            product: true
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    const items = (cart?.cartitem || []).map((item) => {
      const product = productView(item.product);
      const unitPrice = product.price;
      return {
        product,
        quantity: item.quantity,
        available: product.inStock &&
          Number.isSafeInteger(item.product.stockQuantity) &&
          item.product.stockQuantity >= item.quantity,
        availableQuantity: item.product.stockQuantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * item.quantity * 100) / 100
      };
    });
    const subtotal = Math.round(
      items.reduce((sum, item) => sum + item.lineTotal, 0) * 100
    ) / 100;
    return { items, subtotal };
  }

  async availableProduct(client, productId) {
    productId = this.validateProductId(productId);
    const product = await client.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found.");
    if (!product.inStock) throw new ConflictException("This product is unavailable.");
    if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 1) {
      throw new ConflictException("This product's available quantity has not been configured.");
    }
    return product;
  }

  validateItem(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("A cart item is required.");
    }
    const productId = this.validateProductId(input.productId);
    const quantity = input.quantity === undefined ? 1 : input.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException("Quantity must be an integer between 1 and 99.");
    }
    if (Object.keys(input).some((key) => !["productId", "quantity"].includes(key))) {
      throw new BadRequestException("Only productId and quantity are accepted.");
    }
    return { productId, quantity };
  }

  validateProductId(value) {
    const productId = typeof value === "number"
      ? value
      : typeof value === "string" && /^[1-9]\d*$/.test(value)
        ? Number(value)
        : NaN;
    if (!Number.isSafeInteger(productId) || productId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    return productId;
  }
}

Inject(PrismaService)(CartService, undefined, 0);
Injectable()(CartService);

module.exports = { CartService };
