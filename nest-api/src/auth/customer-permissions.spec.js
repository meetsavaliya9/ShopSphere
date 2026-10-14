const { ForbiddenException } = require("@nestjs/common");
const {
  CUSTOMER_PERMISSIONS,
  getConfiguredCustomerPermissions,
  getCustomerPermissions,
  requireCustomerPermission
} = require("./customer-permissions");
const { ProductService } = require("../products/product.service");

describe("Customer permissions", () => {
  function prismaWithDisabled(disabledPermissions) {
    return {
      customerpermission: {
        findMany: jest.fn().mockResolvedValue(
          disabledPermissions.map((permission) => ({ permission }))
        )
      }
    };
  }

  test("defaults customer features to enabled", async () => {
    const permissions = await getCustomerPermissions(prismaWithDisabled([]));

    expect(permissions).toContain("APPLY_COUPON");
    expect(permissions).toContain("ADD_TO_CART");
    expect(permissions).toContain("VIEW_ORDERS");
  });

  test("does not make an enabled child effective while its parent is disabled", async () => {
    const prisma = prismaWithDisabled(["VIEW_COUPON_INPUT", "VIEW_CART"]);
    const permissions = await getCustomerPermissions(prisma);

    expect(permissions).not.toContain("APPLY_COUPON");
    expect(permissions).not.toContain("ADD_TO_CART");
    await expect(
      requireCustomerPermission(prisma, 12, "APPLY_COUPON")
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test("rejects direct coupon application when that feature is disabled", async () => {
    const prisma = prismaWithDisabled(["APPLY_COUPON"]);

    await expect(
      requireCustomerPermission(prisma, 12, "APPLY_COUPON")
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test("preserves multiple valid parent paths for nested actions", async () => {
    const prisma = prismaWithDisabled([]);

    await expect(
      requireCustomerPermission(prisma, 12, "BUY_AGAIN")
    ).resolves.toBe(true);
  });

  test("saves Customer settings without deleting stored permission rows", async () => {
    const records = new Map();
    const client = {
      customerpermission: {
        async upsert({ where, create, update }) {
          const existing = records.get(where.permission);
          const saved = existing ? { ...existing, ...update } : create;
          records.set(where.permission, saved);
          return saved;
        },
        async findMany() {
          return [...records.values()];
        }
      }
    };
    client.$transaction = (callback) => callback(client);
    const service = new ProductService({ client });
    const result = await service.replaceCustomerPermissions(["VIEW_SHOP"]);

    expect(result.permissions).toEqual(["VIEW_SHOP"]);
    expect(records.size).toBe(CUSTOMER_PERMISSIONS.length);
    expect(records.get("VIEW_SHOP").enabled).toBe(true);
    expect(records.get("APPLY_COUPON").enabled).toBe(false);
    await expect(getConfiguredCustomerPermissions(client)).resolves.toEqual(["VIEW_SHOP"]);
  });
});
