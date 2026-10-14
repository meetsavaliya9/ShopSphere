const { BadRequestException, ConflictException } = require("@nestjs/common");
const { CartService: NestCartService } = require("../src/cart/cart.service");
const { WishlistService: NestWishlistService } = require("../src/wishlist/wishlist.service");
const { ProductService, validateProductInput } = require("../src/products/product.service");

class CartService extends NestCartService {
  constructor({ client }) {
    super({
      client: {
        ...client,
        customerpermission: client.customerpermission || {
          async findMany() {
            return [];
          }
        }
      }
    });
  }
}

class WishlistService extends NestWishlistService {
  constructor({ client }) {
    super({
      client: {
        ...client,
        customerpermission: client.customerpermission || {
          async findMany() {
            return [];
          }
        }
      }
    });
  }
}

describe("Prisma-backed customer catalog services", () => {
  it("accepts numeric product IDs for cart items and rejects invalid IDs", () => {
    const cart = new CartService({ client: {} });

    expect(cart.validateItem({ productId: 12, quantity: 2 })).toEqual({
      productId: 12,
      quantity: 2
    });
    expect(cart.validateItem({ productId: "12" })).toEqual({
      productId: 12,
      quantity: 1
    });
    expect(() => cart.validateItem({ productId: "0" })).toThrow(BadRequestException);
    expect(() => cart.validateItem({ productId: "1e2" })).toThrow(BadRequestException);
  });

  it("reads cartitem relations and treats the schema's inStock flag as availability", async () => {
    const product = {
      id: 12,
      name: "Test product",
      description: "",
      category: "Accessories",
      price: "12.50",
      inStock: true,
      stockQuantity: 5
    };
    let requestedInclude;
    const cart = new CartService({
      client: {
        cart: {
          async findUnique(args) {
            requestedInclude = args.include;
            return {
              cartitem: [{ product, quantity: 2 }]
            };
          }
        }
      }
    });

    await expect(cart.read(4)).resolves.toMatchObject({
      items: [
        {
          product: { id: 12, category: "Accessories", inStock: true, price: 12.5 },
          quantity: 2,
          available: true,
          availableQuantity: 5,
          unitPrice: 12.5,
          lineTotal: 25
        }
      ],
      subtotal: 25
    });
    expect(requestedInclude).toHaveProperty("cartitem");
    expect(requestedInclude.cartitem.include.product).toBe(true);
  });

  it("validates string route product IDs before deleting only from the user's cart", async () => {
    let deleteWhere;
    const cart = new CartService({
      client: {
        cart: {
          async findUnique({ where }) {
            expect(where).toEqual({ userId: 9 });
            return { id: 31 };
          }
        },
        cartitem: {
          async deleteMany({ where }) {
            deleteWhere = where;
            return { count: 1 };
          }
        }
      }
    });
    cart.read = jest.fn().mockResolvedValue({ items: [], subtotal: 0 });

    await expect(cart.remove(9, "4")).resolves.toEqual({ items: [], subtotal: 0 });
    expect(deleteWhere).toEqual({ cartId: 31, productId: 4 });
    expect(cart.read).toHaveBeenCalledWith(9);
  });

  it("uses numeric product IDs when adding a string-ID route item", async () => {
    let productLookup;
    let itemUpsert;
    const transaction = {
      product: {
        async findUnique({ where }) {
          productLookup = where;
          return { id: 5, inStock: true, stockQuantity: 5 };
        }
      },
      cart: {
        async upsert() {
          return { id: 31 };
        }
      },
      cartitem: {
        async findUnique({ where }) {
          expect(where).toEqual({ cartId_productId: { cartId: 31, productId: 5 } });
          return null;
        },
        async upsert(args) {
          itemUpsert = args;
        }
      }
    };
    const cart = new CartService({
      client: {
        async $transaction(operation) {
          return operation(transaction);
        }
      }
    });
    cart.read = jest.fn().mockResolvedValue({ items: [], subtotal: 0 });

    await expect(cart.add(9, { productId: "5" })).resolves.toEqual({ items: [], subtotal: 0 });
    expect(productLookup).toEqual({ id: 5 });
    expect(itemUpsert.where).toEqual({ cartId_productId: { cartId: 31, productId: 5 } });
    expect(itemUpsert.create).toMatchObject({ cartId: 31, productId: 5, quantity: 1 });
  });

  it("rejects cart additions that exceed the latest available stock", async () => {
    const upsert = jest.fn();
    const transaction = {
      product: {
        async findUnique() {
          return { id: 5, inStock: true, stockQuantity: 5 };
        }
      },
      cart: {
        async upsert() {
          return { id: 31 };
        }
      },
      cartitem: {
        async findUnique() {
          return { quantity: 4 };
        },
        upsert
      }
    };
    const cart = new CartService({
      client: {
        async $transaction(operation) {
          return operation(transaction);
        }
      }
    });

    await expect(cart.add(9, { productId: 5, quantity: 2 })).rejects.toThrow(
      "Only 5 units of this product are currently available."
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["increase", 3],
    ["decrease", 1]
  ])("uses numeric product IDs when %s cart quantity", async (_change, quantity) => {
    const productLookup = jest.fn(async ({ where }) => {
      expect(where.id).toBe(5);
      expect(Number.isInteger(where.id)).toBe(true);
      return { id: 5, inStock: true, stockQuantity: 8 };
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      cart: {
        async findUnique({ where }) {
          expect(where).toEqual({ userId: 9 });
          return { id: 31 };
        }
      },
      product: { findUnique: productLookup },
      cartitem: {
        async findUnique() {
          return { quantity: 2 };
        },
        updateMany
      }
    };
    const cart = new CartService({
      client: {
        async $transaction(operation) {
          return operation(transaction);
        }
      }
    });
    cart.read = jest.fn().mockResolvedValue({ items: [], subtotal: 0 });

    await expect(cart.update(9, "5", { quantity })).resolves.toEqual({ items: [], subtotal: 0 });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { cartId: 31, productId: 5, quantity: 2 },
      data: expect.objectContaining({ quantity })
    }));
  });

  it("validates and normalizes product IDs before direct availability lookups", async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 5, inStock: true, stockQuantity: 5 });
    const cart = new CartService({ client: { product: { findUnique } } });

    await expect(cart.availableProduct(cart.prisma, "5")).resolves.toMatchObject({ id: 5 });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 5 } });
    await expect(cart.availableProduct(cart.prisma, "5x")).rejects.toThrow(BadRequestException);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid cart removal product IDs before querying Prisma", async () => {
    const findCart = jest.fn();
    const cart = new CartService({
      client: {
        cart: { findUnique: findCart }
      }
    });

    for (const productId of ["0", "-4", "1.5", "4x", 0, -2, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(cart.remove(9, productId)).rejects.toThrow(BadRequestException);
    }
    expect(findCart).not.toHaveBeenCalled();
  });

  it("uses numeric Prisma product IDs and the existing inStock column", async () => {
    const wishlist = new WishlistService({
      client: {
        wishlistitem: {
          async findMany() {
            return [{
              product: {
                id: 12,
                name: "Test product",
                description: "",
                category: "Accessories",
                price: "12.50",
                inStock: true
              }
            }];
          }
        }
      }
    });

    expect(wishlist.validateProductId("12")).toBe(12);
    expect(() => wishlist.validateProductId("12x")).toThrow(BadRequestException);
    await expect(wishlist.list(4)).resolves.toMatchObject({
      items: [{ id: 12, category: "Accessories", price: 12.5 }]
    });
  });

  it("matches product fields and stock type to the Prisma schema", () => {
    expect(validateProductInput({
      name: "Example",
      price: "4.50",
      category: "Accessories",
      inStock: false
    })).toMatchObject({ name: "Example", price: 4.5, category: "Accessories", inStock: false });
    expect(() => validateProductInput({
      name: "Example",
      price: 4.5,
      category: "Accessories",
      inStock: "false"
    })).toThrow(BadRequestException);
    expect(() => validateProductInput({
      name: "Example",
      price: 4.5,
      category: "Accessories",
      stock: 2
    })).toThrow(BadRequestException);
    expect(() => validateProductInput({
      name: "Example",
      price: 4.5,
      category: "x".repeat(101)
    })).toThrow(BadRequestException);
  });

  it("validates manager assignments before creating products", async () => {
    let productCreated = false;
    const service = new ProductService({
      client: {
        user: {
          async findUnique({ where }) {
            return where.id === 4 ? { id: 4, role: "MANAGER" } : null;
          }
        },
        product: {
          async create({ data }) {
            productCreated = true;
            return { id: 8, manager: null, ...data };
          }
        }
      }
    });
    const input = {
      name: "Example",
      price: 4.5,
      category: "Accessories",
      managerId: 4
    };

    await expect(service.create(input)).resolves.toMatchObject({ managerId: 4 });
    expect(productCreated).toBe(true);
    productCreated = false;
    await expect(service.create({ ...input, managerId: 99 })).rejects.toThrow(BadRequestException);
    expect(productCreated).toBe(false);
  });

  it("rejects a product whose inStock flag is false", async () => {
    const cart = new CartService({
      client: {
        product: {
          async findUnique() {
            return { id: 12, inStock: false };
          }
        }
      }
    });

    await expect(cart.availableProduct(cart.prisma, 12)).rejects.toThrow(ConflictException);
  });
});
