const { BadRequestException, ForbiddenException } = require("@nestjs/common");
const {
  INVENTORY_MANAGER_PERMISSIONS,
  ProductService
} = require("../src/products/product.service");
const {
  AdminOnlyGuard,
  ManagerOnlyGuard,
  ProductController
} = require("../src/products/product.controller");
const { ManagerCategoryController } = require("../src/categories/category.controller");
const { ManagerOrderController } = require("../src/orders/order.controller");
const { OrderService } = require("../src/orders/order.service");
const { ManagerProductImageController } = require("../src/admin/admin.controller");
const { ConflictException } = require("@nestjs/common");
const { CsrfGuard } = require("../src/auth/auth-security");
const bcrypt = require("bcryptjs");

describe("Inventory Manager roles and permissions", () => {
  it("keeps the new role assignable while preserving the existing roles", async () => {
    let updated;
    let currentRole = "CUSTOMER";
    const service = new ProductService({
      client: {
        user: {
          async findUnique() {
            return { id: 7, role: currentRole };
          },
          async count() {
            return 2;
          },
          async update({ data }) {
            updated = data.role;
            currentRole = data.role;
            return { id: 7, role: data.role };
          }
        }
      }
    });

    await expect(service.updateUserRole(7, "INVENTORY_MANAGER"))
      .resolves.toMatchObject({ role: "INVENTORY_MANAGER" });
    expect(updated).toBe("INVENTORY_MANAGER");
    for (const role of ["CUSTOMER", "ADMIN", "MANAGER"]) {
      await expect(service.updateUserRole(7, role)).resolves.toMatchObject({ role });
    }
    await expect(service.updateUserRole(7, "UNKNOWN"))
      .rejects.toThrow("A valid user ID and role are required.");
  });

  it("prevents removing the last administrator", async () => {
    const update = jest.fn();
    const service = new ProductService({
      client: {
        async $transaction(operation) {
          return operation({
            user: {
              async findUnique() {
                return { id: 1, role: "ADMIN" };
              },
              async count() {
                return 1;
              },
              update
            }
          });
        }
      }
    });

    await expect(service.updateUserRole(1, "CUSTOMER"))
      .rejects.toThrow("The last administrator cannot be removed.");
    expect(update).not.toHaveBeenCalled();
  });

  it("returns real catalog-wide availability totals for the Admin inventory cards", async () => {
    const service = new ProductService({
      client: {
        product: {
          async count({ where } = {}) {
            if (where && Object.hasOwn(where, "stockQuantity")) return 2;
            return where?.inStock === true ? 4 : 6;
          },
          async aggregate() {
            return { _sum: { stockQuantity: 9 } };
          }
        }
      }
    });

    await expect(service.inventorySummary()).resolves.toEqual({
      total: 6,
      inStock: 4,
      outOfStock: 2,
      totalKnownStockUnits: 9,
      unknownQuantityCount: 2,
      availabilityRate: 67
    });
  });

  it("includes category text in server-side product searches", async () => {
    let filter;
    const service = new ProductService({
      client: {
        product: {
          async findMany({ where }) {
            filter = where;
            return [];
          },
          async count() {
            return 0;
          }
        }
      }
    });

    await service.list({ search: "Home", page: "1", limit: "12" });
    expect(filter.OR).toContainEqual({ category: { contains: "Home" } });
  });

  it("persists only supported permissions and supports revoking them", async () => {
    const grants = new Set();
    const service = new ProductService({
      client: {
        user: {
          async findUnique() {
            return { id: 7, role: "INVENTORY_MANAGER" };
          }
        },
        inventorymanagerpermission: {
          async findMany({ where }) {
            return [...grants]
              .filter((permission) => !where || where.userId === 7)
              .map((permission) => ({ permission }));
          },
          async upsert({ create }) {
            grants.add(create.permission);
          },
          async deleteMany({ where }) {
            grants.delete(where.permission);
          }
        }
      }
    });

    const permission = INVENTORY_MANAGER_PERMISSIONS[0];
    await expect(service.setInventoryManagerPermission(7, permission, true))
      .resolves.toEqual({ userId: 7, permissions: [permission] });
    await expect(service.setInventoryManagerPermission(7, permission, false))
      .resolves.toEqual({ userId: 7, permissions: [] });
    await expect(service.setInventoryManagerPermission(7, "DELETE_USERS", true))
      .rejects.toThrow("A valid Inventory Manager permission update is required.");
  });

  it("atomically replaces an Inventory Manager permission set", async () => {
    const permissions = new Set(["VIEW_PRODUCTS"]);
    const service = new ProductService({
      client: {
        async $transaction(operation) {
          return operation({
            user: {
              async findUnique() {
                return { id: 7, role: "INVENTORY_MANAGER" };
              }
            },
            inventorymanagerpermission: {
              async deleteMany({ where }) {
                expect(where).toEqual({ userId: 7 });
                permissions.clear();
              },
              async createMany({ data }) {
                data.forEach(({ permission }) => permissions.add(permission));
              }
            }
          });
        }
      }
    });

    await expect(service.replaceInventoryManagerPermissions(7, [
      "VIEW_PRODUCTS",
      "VIEW_STOCK_LEVELS"
    ])).resolves.toEqual({
      userId: 7,
      permissions: ["VIEW_PRODUCTS", "VIEW_STOCK_LEVELS"]
    });
    expect([...permissions]).toEqual(["VIEW_PRODUCTS", "VIEW_STOCK_LEVELS"]);
    await expect(service.replaceInventoryManagerPermissions(7, ["GRANT_ADMIN"]))
      .rejects.toThrow("Provide a valid list of Inventory Manager permissions.");
  });

  it("normalizes the route parameter before replacing Inventory Manager permissions", async () => {
    const result = { userId: 7, permissions: ["VIEW_PRODUCTS"] };
    const replaceInventoryManagerPermissions = jest.fn().mockResolvedValue(result);
    const controller = new ProductController({ replaceInventoryManagerPermissions });
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };

    await controller.replaceInventoryManagerPermissions(
      { id: "7" },
      { permissions: result.permissions },
      response
    );

    expect(replaceInventoryManagerPermissions).toHaveBeenCalledWith("7", result.permissions);
    expect(response.payload).toEqual({ data: result });
  });

  it("reports real assigned-product availability without exposing unrelated product fields", async () => {
    const service = new ProductService({
      client: {
        product: {
          async count({ where }) {
            if (where.stockQuantity === null) return 0;
            if (where.inStock === true) return 1;
            if (where.inStock === false) return 1;
            return 2;
          },
          async aggregate() {
            return { _sum: { stockQuantity: 8 } };
          },
          async findMany() {
            return [{
              id: 12,
              name: "Assigned item",
              category: "Home",
              inStock: true,
              stockQuantity: 8,
              lowStockThreshold: 2,
              updatedAt: new Date("2026-10-13T00:00:00Z"),
              price: 999,
              manager: null
            }];
          }
        }
      }
    });

    await expect(service.managerInventoryReport(7)).resolves.toMatchObject({
      assignedProductCount: 2,
      availableProductCount: 1,
      outOfStockCount: 1,
      totalKnownStockUnits: 8,
      unknownQuantityProductCount: 0,
      products: [{
        id: 12,
        name: "Assigned item",
        category: "Home",
        inStock: true,
        stockQuantity: 8,
        lowStockThreshold: 2
      }]
    });
    const report = await service.managerInventoryReport(7);
    expect(report.products[0]).not.toHaveProperty("price");
    expect(report.products[0]).not.toHaveProperty("manager");
  });

  it("guards new inventory insight endpoints with their explicit permissions", async () => {
    let permissions = [];
    const controller = new ProductController({
      async getInventoryManagerPermissions() { return permissions; },
      async list(query, options) {
        expect(query.inStock).toBe("false");
        expect(options.managerId).toBe(7);
        return { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };
      },
      async managerInventoryReport(managerId) {
        expect(managerId).toBe(7);
        return { assignedProductCount: 0, availableProductCount: 0, outOfStockCount: 0, products: [] };
      },
      async managerInventoryAlerts(managerId) {
        expect(managerId).toBe(7);
        return { data: [], lowStockCount: 0, outOfStockCount: 0, pagination: { page: 1, limit: 24, total: 0, totalPages: 0 } };
      }
    });
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };

    await expect(controller.managerInventoryAlerts(request, {}, response))
      .rejects.toThrow("You do not have permission");
    permissions = ["VIEW_LOW_STOCK_ALERTS"];
    await controller.managerInventoryAlerts(request, {}, response);
    expect(response.payload.data.alerts).toEqual([]);
    expect(response.payload.data.lowStockCount).toBe(0);

    permissions = [];
    await expect(controller.managerInventoryReport(request, {}, response))
      .rejects.toThrow("You do not have permission");
    permissions = ["VIEW_INVENTORY_REPORTS"];
    await controller.managerInventoryReport(request, {}, response);
    expect(response.payload.data.assignedProductCount).toBe(0);
  });

  it("lets an administrator securely reset a user's password and revokes sessions", async () => {
    let storedHash;
    let revoked;
    const service = new ProductService({
      client: {
        async $transaction(operation) {
          return operation({
            user: {
              async update({ data, select }) {
                storedHash = data.passwordHash;
                expect(select).not.toHaveProperty("passwordHash");
                return { id: 7, name: "Manager", email: "manager@example.test", role: "INVENTORY_MANAGER" };
              }
            },
            session: {
              async deleteMany({ where }) {
                revoked = where.userId;
              }
            }
          });
        }
      }
    });

    const result = await service.resetUserPassword(7, "manager-secret-42");
    expect(result).toEqual({
      id: 7,
      name: "Manager",
      email: "manager@example.test",
      role: "INVENTORY_MANAGER"
    });
    expect(await bcrypt.compare("manager-secret-42", storedHash)).toBe(true);
    expect(revoked).toBe(7);
    expect(result).not.toHaveProperty("passwordHash");
    await expect(service.resetUserPassword(7, "short")).rejects.toThrow("at least 8 characters");
  });

  it("denies permission assignment to non-Inventory-Manager users", async () => {
    const service = new ProductService({
      client: {
        user: {
          async findUnique() {
            return { id: 7, role: "CUSTOMER" };
          }
        }
      }
    });

    await expect(service.setInventoryManagerPermission(
      7,
      "VIEW_PRODUCTS",
      true
    )).rejects.toThrow("Permissions can only be configured for Inventory Manager accounts.");
  });

  it("requires individual backend permissions for inventory access and updates", async () => {
    const updateInventory = jest.fn();
    let enabledPermissions = [];
    const controller = new ProductController({
      async getInventoryManagerPermissions() {
        return enabledPermissions;
      },
      async list() {
        return {
          data: [{
            id: 1,
            name: "Product",
            description: "Details",
            inStock: true
          }],
          pagination: { page: 1, limit: 24, total: 1, totalPages: 1 }
        };
      },
      updateInventory
    });
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };

    await expect(controller.managerProducts(request, {}, response))
      .rejects.toBeInstanceOf(ForbiddenException);

    enabledPermissions = ["VIEW_INVENTORY_DASHBOARD", "VIEW_PRODUCTS"];
    await controller.managerProducts(request, {}, response);
    expect(response.payload.data[0]).not.toHaveProperty("description");
    expect(response.payload.data[0]).not.toHaveProperty("inStock");

    await expect(controller.updateInventory(
      request,
      "1",
      { inStock: false },
      response
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateInventory).not.toHaveBeenCalled();

    enabledPermissions.push("VIEW_STOCK_LEVELS", "UPDATE_INVENTORY");
    await controller.updateInventory(request, "1", { inStock: false }, response);
    expect(updateInventory).toHaveBeenCalledWith(1, 7, { inStock: false }, 7);
  });

  it("requires explicit manager permissions for quantity changes and threshold edits", async () => {
    let enabledPermissions = [];
    const adjustStock = jest.fn().mockResolvedValue({
      id: 12,
      name: "Assigned item",
      inStock: true,
      stockQuantity: 6,
      lowStockThreshold: 2
    });
    const controller = new ProductController({
      async getInventoryManagerPermissions() {
        return enabledPermissions;
      },
      adjustStock
    });
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };
    const body = { quantity: 6, expectedQuantity: null };

    await expect(controller.adjustManagerStock(request, "12", body, response))
      .rejects.toBeInstanceOf(ForbiddenException);
    enabledPermissions = ["UPDATE_INVENTORY", "VIEW_STOCK_LEVELS"];
    await controller.adjustManagerStock(request, "12", body, response);
    expect(adjustStock).toHaveBeenCalledWith(12, 7, 7, body);

    const thresholdBody = { ...body, lowStockThreshold: 2 };
    await expect(controller.adjustManagerStock(request, "12", thresholdBody, response))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(adjustStock).toHaveBeenCalledTimes(1);

    enabledPermissions.push("MANAGE_STOCK_ALERTS");
    await controller.adjustManagerStock(request, "12", thresholdBody, response);
    expect(adjustStock).toHaveBeenLastCalledWith(12, 7, 7, thresholdBody);

    await expect(controller.adjustManagerStock(
      { user: { id: 1, role: "ADMIN" } },
      "12",
      body,
      response
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("counts manager stock statistics across all assigned products without loading product rows", async () => {
    const queries = [];
    const service = new ProductService({
      client: {
        product: {
          async count({ where }) {
            queries.push(where);
            if (Object.hasOwn(where, "stockQuantity")) return 2;
            if (where.inStock === true) return 4;
            if (where.inStock === false) return 2;
            return 6;
          },
          async aggregate({ where }) {
            queries.push(where);
            return { _sum: { stockQuantity: 17 } };
          }
        }
      }
    });

    await expect(service.managerInventoryStats(7, true)).resolves.toEqual({
      assignedProductCount: 6,
      availableProductCount: 4,
      outOfStockCount: 2,
      totalKnownStockUnits: 17,
      unknownQuantityProductCount: 2
    });
    expect(queries).toEqual([
      { managerId: 7 },
      { managerId: 7, inStock: true },
      { managerId: 7, inStock: false },
      { managerId: 7 },
      { managerId: 7, stockQuantity: null }
    ]);
  });

  it("initializes and adjusts stock atomically, records history, and rejects stale quantities", async () => {
    const history = [];
    const product = {
      id: 12,
      name: "Assigned item",
      description: "",
      category: "Home",
      price: 12,
      inStock: true,
      stockQuantity: null,
      lowStockThreshold: null,
      lowStockAlertActive: false,
      lowStockAlertAt: null,
      managerId: 7,
      updatedAt: new Date()
    };
    const client = {
      async $transaction(operation) {
        return operation({
          product: {
            async findUnique() {
              return { ...product };
            },
            async findFirst() {
              return { ...product };
            },
            async updateMany({ data }) {
              Object.assign(product, data);
              return { count: 1 };
            }
          },
          inventorystockhistory: {
            async create({ data }) {
              history.push(data);
            }
          }
        });
      }
    };
    const service = new ProductService({ client });

    await expect(service.adjustStock(12, 7, 7, {
      unitsToAdd: 6,
      expectedQuantity: null,
      lowStockThreshold: 2,
      reason: "Verified opening count"
    })).resolves.toMatchObject({
      id: 12,
      stockQuantity: 6,
      lowStockThreshold: 2,
      inStock: true
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      previousQuantity: null,
      newQuantity: 6,
      quantityChange: null,
      actionType: "INITIALIZE",
      reason: "Verified opening count",
      userId: 7
    });

    await expect(service.adjustStock(12, 7, 7, {
      unitsToAdd: 2,
      expectedQuantity: 6,
      lowStockThreshold: 2,
      reason: "Restocked from supplier"
    })).resolves.toMatchObject({
      stockQuantity: 8,
      lowStockThreshold: 2
    });
    expect(history[1]).toMatchObject({
      previousQuantity: 6,
      newQuantity: 8,
      quantityChange: 2,
      actionType: "ADDITION",
      reason: "Restocked from supplier"
    });

    await expect(service.adjustStock(12, 7, 7, {
      unitsToAdd: 4,
      expectedQuantity: null
    })).rejects.toThrow("Stock changed since it was loaded.");
    expect(history).toHaveLength(2);
  });

  it("creates one alert on threshold crossing and rearms after replenishment", async () => {
    const product = {
      id: 18,
      name: "Threshold item",
      description: "",
      category: "Home",
      price: 12,
      inStock: true,
      stockQuantity: 7,
      lowStockThreshold: 5,
      lowStockAlertActive: false,
      lowStockAlertAt: null,
      managerId: 7,
      updatedAt: new Date()
    };
    const transaction = {
      product: {
        async findFirst() { return { ...product }; },
        async findUnique() { return { ...product }; },
        async updateMany({ where, data }) {
          if (where.stockQuantity !== product.stockQuantity) return { count: 0 };
          Object.assign(product, data);
          return { count: 1 };
        }
      },
      inventorystockhistory: { async create() {} }
    };
    const service = new ProductService({
      client: { async $transaction(operation) { return operation(transaction); } }
    });
    const changeTo = async (quantity) => service.adjustStock(18, 7, 7, {
      quantity,
      expectedQuantity: product.stockQuantity,
      reason: "Stock count correction"
    });

    await changeTo(5);
    const firstAlert = product.lowStockAlertAt;
    expect(product.lowStockAlertActive).toBe(true);
    expect(firstAlert).toBeInstanceOf(Date);
    await changeTo(4);
    expect(product.lowStockAlertAt).toBe(firstAlert);
    await changeTo(6);
    expect(product.lowStockAlertActive).toBe(false);
    expect(product.lowStockAlertAt).toBeNull();
    await changeTo(5);
    expect(product.lowStockAlertActive).toBe(true);
    expect(product.lowStockAlertAt).toBeInstanceOf(Date);
    expect(product.lowStockAlertAt.getTime()).toBeGreaterThanOrEqual(firstAlert.getTime());
  });

  it("calculates low-stock alerts from initialized quantities without inferring legacy counts", async () => {
    const service = new ProductService({
      client: {
        product: {
          async findMany() {
            return [
              { id: 1, name: "Low", category: "Home", inStock: true, stockQuantity: 2, lowStockThreshold: 2, lowStockAlertAt: new Date("2026-10-14T06:00:00Z"), updatedAt: new Date() },
              { id: 2, name: "Empty", category: "Home", inStock: false, stockQuantity: null, lowStockThreshold: null, updatedAt: new Date() },
              { id: 3, name: "Unknown", category: "Home", inStock: true, stockQuantity: null, lowStockThreshold: null, updatedAt: new Date() }
            ];
          }
        }
      }
    });

    await expect(service.managerInventoryAlerts(7, { limit: "10" })).resolves.toMatchObject({
      lowStockCount: 1,
      outOfStockCount: 1,
      data: [
        { id: 2, alertType: "OUT_OF_STOCK" },
        { id: 1, alertType: "LOW_STOCK", lowStockAlertAt: new Date("2026-10-14T06:00:00Z") }
      ]
    });
  });

  it("requires dashboard permission and returns only permitted summary fields", async () => {
    let enabledPermissions = [];
    const controller = new ProductController({
      async getInventoryManagerPermissions() {
        return enabledPermissions;
      },
      async managerInventoryStats(managerId, includeStock) {
        expect(managerId).toBe(7);
        expect(includeStock).toBe(true);
        return {
          assignedProductCount: 2,
          availableProductCount: 1,
          outOfStockCount: 1,
          totalKnownStockUnits: 4,
          unknownQuantityProductCount: 2
        };
      }
    });
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };

    await expect(controller.managerDashboard(request, response))
      .rejects.toBeInstanceOf(ForbiddenException);
    enabledPermissions = [
      "VIEW_INVENTORY_DASHBOARD",
      "VIEW_DASHBOARD_STATISTICS",
      "VIEW_PRODUCTS",
      "VIEW_STOCK_LEVELS"
    ];
    await controller.managerDashboard(request, response);
    expect(response.payload.data).toEqual({
      statisticsVisible: true,
      assignedProductCount: 2,
      stockLevelsVisible: true,
      availableProductCount: 1,
      outOfStockCount: 1,
      totalKnownStockUnits: 4,
      unknownQuantityProductCount: 2
    });
  });

  it("checks create and edit permissions before manager product operations", async () => {
    let enabledPermissions = [];
    const createManagerProduct = jest.fn().mockResolvedValue({ id: 10, name: "New product" });
    const updateManagerProduct = jest.fn().mockResolvedValue({ id: 10, name: "Updated product" });
    const controller = new ProductController({
      async getInventoryManagerPermissions() {
        return enabledPermissions;
      },
      createManagerProduct,
      updateManagerProduct
    });
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };

    await expect(controller.createManagerProduct(request, { name: "New product" }, response))
      .rejects.toBeInstanceOf(ForbiddenException);
    enabledPermissions = ["CREATE_PRODUCTS"];
    await controller.createManagerProduct(request, { name: "New product" }, response);
    expect(createManagerProduct).toHaveBeenCalledWith(7, { name: "New product" });
    expect(response.payload.data).not.toHaveProperty("description");
    const imagePayload = {
      name: "New product",
      imageUrl: "https://res.cloudinary.com/demo/image/upload/shopsphere/products/item.webp",
      imagePublicId: "shopsphere/products/item"
    };
    await expect(controller.createManagerProduct(request, imagePayload, response))
      .rejects.toBeInstanceOf(ForbiddenException);
    enabledPermissions.push("UPLOAD_PRODUCT_IMAGES");
    await controller.createManagerProduct(request, imagePayload, response);
    expect(createManagerProduct).toHaveBeenLastCalledWith(7, imagePayload);

    await expect(controller.editManagerProduct(request, "10", { name: "Updated product" }, response))
      .rejects.toBeInstanceOf(ForbiddenException);
    enabledPermissions.push("EDIT_PRODUCTS");
    await expect(controller.editManagerProduct(request, "10", {
      ...imagePayload,
      imageUrl: "https://example.com/item.webp"
    }, response)).rejects.toBeInstanceOf(BadRequestException);
    await controller.editManagerProduct(request, "10", { name: "Updated product" }, response);
    expect(updateManagerProduct).toHaveBeenCalledWith("10", 7, { name: "Updated product" });
  });

  it("requires saved permissions for product details and deletion and scopes both to the signed-in manager", async () => {
    let enabledPermissions = [];
    const getManagerProduct = jest.fn().mockResolvedValue({ id: 12, name: "Assigned item", managerId: 7 });
    const removeManagerProduct = jest.fn().mockResolvedValue({ deleted: true });
    const controller = new ProductController({
      async getInventoryManagerPermissions() {
        return enabledPermissions;
      },
      getManagerProduct,
      removeManagerProduct
    });
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };

    await expect(controller.managerProductDetails(request, "12", response))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.removeManagerProduct(request, "12", response))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(getManagerProduct).not.toHaveBeenCalled();
    expect(removeManagerProduct).not.toHaveBeenCalled();

    enabledPermissions = ["VIEW_PRODUCT_DETAILS"];
    await controller.managerProductDetails(request, "12", response);
    expect(getManagerProduct).toHaveBeenCalledWith("12", 7);
    expect(response.payload.data).toMatchObject({ id: 12, name: "Assigned item" });

    enabledPermissions = ["DELETE_PRODUCTS"];
    await controller.removeManagerProduct(request, "12", response);
    expect(removeManagerProduct).toHaveBeenCalledWith("12", 7);
    expect(response.payload.data).toEqual({ deleted: true });
  });

  it("restricts category reads to assigned product categories and gates category management", async () => {
    let permissions = [];
    const categoryCreate = jest.fn();
    const controller = new ManagerCategoryController(
      { create: categoryCreate },
      {
        client: {
          inventorymanagerpermission: {
            async findMany() {
              return permissions.map((permission) => ({ permission }));
            }
          },
          product: {
            async findMany({ where }) {
              expect(where).toEqual({ managerId: 7 });
              return [{ category: "Assigned" }, { category: "Assigned" }];
            }
          },
          category: {
            async findMany() {
              return [
                { id: 3, name: "Assigned", slug: "assigned", description: null },
                { id: 4, name: "Shared", slug: "shared", description: null }
              ];
            }
          }
        }
      }
    );
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };

    await expect(controller.list(request, response)).rejects.toBeInstanceOf(ForbiddenException);
    permissions = ["VIEW_CATEGORIES"];
    await controller.list(request, response);
    expect(response.payload.data).toEqual([
      { id: 3, name: "Assigned", slug: "assigned", description: null, productCount: 2 },
      { id: 4, name: "Shared", slug: "shared", description: null, productCount: 0 }
    ]);
    await expect(controller.create(request, { name: "New" }, response))
      .rejects.toBeInstanceOf(ForbiddenException);
    permissions.push("MANAGE_CATEGORIES");
    await controller.create(request, { name: "New" }, response);
    expect(categoryCreate).toHaveBeenCalled();
  });

  it("blocks category renames that would change products owned by another manager", async () => {
    let permissionRows = [{ permission: "MANAGE_CATEGORIES" }];
    const categoryUpdate = jest.fn();
    const controller = new ManagerCategoryController(
      { update: categoryUpdate },
      {
        client: {
          inventorymanagerpermission: {
            async findMany() { return permissionRows; }
          },
          category: {
            async findUnique() { return { name: "Shared" }; }
          },
          product: {
            async count({ where }) {
              expect(where).toEqual({
                category: "Shared",
                OR: [{ managerId: { not: 7 } }, { managerId: null }]
              });
              return 1;
            }
          }
        }
      }
    );
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };
    const response = { status() { return this; }, json(payload) { this.payload = payload; return this; } };

    await expect(controller.update(request, "4", { name: "Renamed" }, response))
      .rejects.toBeInstanceOf(ConflictException);
    expect(categoryUpdate).not.toHaveBeenCalled();
  });

  it("requires explicit image-upload permission on the manager upload API", async () => {
    const routeGuards = Reflect.getMetadata("__guards__", ManagerProductImageController);
    expect(routeGuards).toContain(CsrfGuard);
    const uploadProductImage = jest.fn().mockResolvedValue({ imageUrl: "https://res.cloudinary.com/demo/image/upload/item.webp" });
    let permissions = [];
    const controller = new ManagerProductImageController(
      { uploadProductImage },
      {
        client: {
          inventorymanagerpermission: {
            async findMany() { return permissions.map((permission) => ({ permission })); }
          }
        }
      }
    );
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" }, body: Buffer.from("image") };
    const response = { status() { return this; }, json(payload) { this.payload = payload; return this; } };

    await expect(controller.upload(request, response)).rejects.toBeInstanceOf(ForbiddenException);
    expect(uploadProductImage).not.toHaveBeenCalled();
    permissions = ["UPLOAD_PRODUCT_IMAGES"];
    await controller.upload(request, response);
    expect(uploadProductImage).toHaveBeenCalledWith(request);
    expect(response.payload.data).toHaveProperty("imageUrl");
  });

  it("lists only assigned-product order details and gates the endpoint by permission", async () => {
    let permissions = [];
    const listManagerOrders = jest.fn().mockResolvedValue([{ id: 5 }]);
    const controller = new ManagerOrderController(
      { listManagerOrders },
      {
        client: {
          inventorymanagerpermission: {
            async findMany() {
              return permissions.map((permission) => ({ permission }));
            }
          }
        }
      }
    );
    const response = {
      status() { return this; },
      json(payload) { this.payload = payload; return this; }
    };
    const request = { user: { id: 7, role: "INVENTORY_MANAGER" } };

    await expect(controller.list(request, response)).rejects.toBeInstanceOf(ForbiddenException);
    permissions = ["VIEW_ORDERS"];
    await controller.list(request, response);
    expect(listManagerOrders).toHaveBeenCalledWith(7, false);
    permissions.push("VIEW_ORDER_DETAILS");
    await controller.list(request, response);
    expect(listManagerOrders).toHaveBeenLastCalledWith(7, true);
  });

  it("limits manager order totals and included line items to the manager's products", async () => {
    let query;
    const service = new OrderService({
      client: {
        order: {
          async findMany(input) {
            query = input;
            return [{
              id: 5,
              status: "PAID",
              totalAmount: 250,
              currency: "INR",
              createdAt: new Date("2026-10-13T00:00:00Z"),
              orderitem: [
                { id: 1, productName: "Assigned product", quantity: 2, unitPrice: 50 }
              ]
            }];
          }
        }
      }
    });

    const result = await service.listManagerOrders(7, false);
    expect(query.where.orderitem.some.product.is.managerId).toBe(7);
    expect(result[0].assignedItemsTotal).toBe(100);
    expect(result[0]).not.toHaveProperty("items");
    expect(result[0]).not.toHaveProperty("totalAmount");
  });

  it("limits product edits to products assigned to the requesting manager", async () => {
    let updateWhere;
    const service = new ProductService({
      client: {
        product: {
          async updateMany({ where }) {
            updateWhere = where;
            return { count: 0 };
          }
        }
      }
    });

    await expect(service.updateManagerProduct("10", 7, { name: "Changed" }))
      .rejects.toThrow("Assigned product not found.");
    expect(updateWhere).toEqual({ id: 10, managerId: 7 });
  });

  it("allows Inventory Managers into the shared manager area, not the Admin area", () => {
    const context = (role) => ({
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) })
    });

    expect(new ManagerOnlyGuard().canActivate(context("INVENTORY_MANAGER"))).toBe(true);
    expect(new ManagerOnlyGuard().canActivate(context("MANAGER"))).toBe(true);
    expect(() => new AdminOnlyGuard().canActivate(context("INVENTORY_MANAGER")))
      .toThrow(ForbiddenException);
  });
});
