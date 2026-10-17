const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException
} = require("@nestjs/common");
const { PrismaService } = require("../prisma/prisma.service");
const bcrypt = require("bcryptjs");
const { applyStockChange } = require("./inventory-stock");
const {
  CUSTOMER_PERMISSIONS,
  getConfiguredCustomerPermissions
} = require("../auth/customer-permissions");

const INVENTORY_MANAGER_PERMISSIONS = Object.freeze([
  "VIEW_INVENTORY_DASHBOARD",
  "VIEW_PRODUCTS",
  "VIEW_PRODUCT_DETAILS",
  "VIEW_STOCK_LEVELS",
  "UPDATE_INVENTORY",
  "CREATE_PRODUCTS",
  "EDIT_PRODUCTS",
  "DELETE_PRODUCTS",
  "UPLOAD_PRODUCT_IMAGES",
  "VIEW_DASHBOARD_STATISTICS",
  "VIEW_CATEGORIES",
  "MANAGE_CATEGORIES",
  "VIEW_ORDERS",
  "VIEW_ORDER_DETAILS",
  "VIEW_LOW_STOCK_ALERTS",
  "MANAGE_STOCK_ALERTS",
  "VIEW_STOCK_HISTORY",
  "VIEW_INVENTORY_REPORTS",
  "EXPORT_INVENTORY_REPORTS"
]);

const PRODUCT_FIELDS = new Set([
  "name",
  "description",
  "price",
  "category",
  "inStock",
  "imageUrl",
  "imagePublicId",
  "managerId"
]);

function productView(product, { includeInventory = false, includeAvailability = false } = {}) {
  if (!product) return null;
  const {
    manager,
    price,
    inStock,
    stockQuantity,
    lowStockThreshold,
    lowStockAlertActive,
    lowStockAlertAt,
    ...fields
  } = product;
  return {
    ...fields,
    id: product.id,
    price: Number(price),
    inStock: Boolean(inStock),
    category: product.category,
    ...(includeInventory ? { stockQuantity, lowStockThreshold } : {}),
    ...(includeAvailability ? { availableQuantity: stockQuantity } : {}),
    ...(manager ? { manager: { id: manager.id, name: manager.name, email: manager.email } } : {})
  };
}

function validateProductInput(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestException("A product object is required.");
  }
  for (const key of Object.keys(input)) {
    if (!PRODUCT_FIELDS.has(key)) {
      throw new BadRequestException(`Unsupported product field: ${key}.`);
    }
  }
  const data = {};
  if (!partial || Object.hasOwn(input, "name")) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 191) {
      throw new BadRequestException("Product name is required and must be at most 191 characters.");
    }
    data.name = input.name.trim();
  }
  if (!partial || Object.hasOwn(input, "price")) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0 || price > 99999999.99) {
      throw new BadRequestException("Product price must be a non-negative amount.");
    }
    data.price = price;
  }
  if (!partial || Object.hasOwn(input, "category")) {
    if (
      typeof input.category === "string" &&
      input.category.trim() &&
      input.category.trim().length <= 100
    ) {
      data.category = input.category.trim();
    } else {
      throw new BadRequestException("Product category is required and must be at most 100 characters.");
    }
  }
  if (Object.hasOwn(input, "inStock") || !partial) {
    if (Object.hasOwn(input, "inStock")) {
      if (typeof input.inStock !== "boolean") {
        throw new BadRequestException("inStock must be a boolean.");
      }
      data.inStock = input.inStock;
    } else {
      data.inStock = true;
    }
  }
  if (Object.hasOwn(input, "description")) {
    if (input.description !== null && typeof input.description !== "string") {
      throw new BadRequestException("Product description must be text.");
    }
    data.description = input.description?.trim() || "";
  } else if (!partial) {
    data.description = "";
  }
  if (Object.hasOwn(input, "imageUrl")) {
    if (
      input.imageUrl !== null &&
      (typeof input.imageUrl !== "string" || input.imageUrl.length > 2048)
    ) {
      throw new BadRequestException("Product image URL is invalid.");
    }
    data.imageUrl = input.imageUrl || null;
  }
  if (Object.hasOwn(input, "imagePublicId")) {
    if (
      input.imagePublicId !== null &&
      (typeof input.imagePublicId !== "string" || input.imagePublicId.length > 255)
    ) {
      throw new BadRequestException("Product image public ID is invalid.");
    }
    data.imagePublicId = input.imagePublicId || null;
  }
  if (Object.hasOwn(input, "managerId")) {
    if (input.managerId !== null) {
      const managerId = Number(input.managerId);
      if (!Number.isSafeInteger(managerId) || managerId < 1) {
        throw new BadRequestException("managerId must be a positive integer or null.");
      }
      data.managerId = managerId;
    } else {
      data.managerId = null;
    }
  }
  if (partial && Object.keys(data).length === 0) {
    throw new BadRequestException("Provide at least one product field to update.");
  }
  return data;
}

class ProductService {
  constructor(prismaService) {
    this.prisma = prismaService.client;
  }

  async listManagerRecentOrders(managerId, includeDetails = false) {
    const orders = await this.prisma.order.findMany({
      where: {
        orderitem: {
          some: { product: { is: { managerId: Number(managerId) } } }
        }
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        orderitem: {
          where: { product: { is: { managerId: Number(managerId) } } },
          select: { productName: true, quantity: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    return orders.map(({ id, status, createdAt, orderitem }) => ({
      id,
      status,
      createdAt,
      ...(includeDetails ? {
        items: orderitem.map(({ productName, quantity }) => ({ productName, quantity }))
      } : {})
    }));
  }

  async managerInventoryStats(managerId, includeStock) {
    const where = { managerId: Number(managerId) };
    const [assignedProductCount, availableProductCount, outOfStockCount, stockAggregate, unknownQuantityProductCount] = await Promise.all([
      this.prisma.product.count({ where }),
      includeStock ? this.prisma.product.count({ where: { ...where, inStock: true } }) : null,
      includeStock ? this.prisma.product.count({ where: { ...where, inStock: false } }) : null,
      includeStock ? this.prisma.product.aggregate({ where, _sum: { stockQuantity: true } }) : null,
      includeStock ? this.prisma.product.count({ where: { ...where, stockQuantity: null } }) : null
    ]);
    return {
      assignedProductCount,
      availableProductCount,
      outOfStockCount,
      totalKnownStockUnits: stockAggregate?._sum?.stockQuantity || 0,
      unknownQuantityProductCount
    };
  }

  async managerInventoryReport(managerId, query = {}) {
    const [statistics, products] = await Promise.all([
      this.managerInventoryStats(managerId, true),
      this.list({ ...query, limit: query.limit || "10" }, {
        includeInactive: true,
        managerId
      })
    ]);
    return {
      ...statistics,
      products: products.data.map(({ id, name, category, inStock, stockQuantity, lowStockThreshold, updatedAt }) => ({
        id,
        name,
        category,
        inStock,
        stockQuantity,
        lowStockThreshold,
        updatedAt
      })),
      pagination: products.pagination
    };
  }

  async managerInventoryAlerts(managerId, query = {}) {
    const numericManagerId = Number(managerId);
    const search = String(query.search || "").trim().toLocaleLowerCase();
    if (search.length > 200) throw new BadRequestException("Search term is too long.");
    const candidates = await this.prisma.product.findMany({
      where: {
        managerId: numericManagerId,
        OR: [
          { inStock: false },
          { stockQuantity: 0 },
          { AND: [{ stockQuantity: { not: null } }, { lowStockThreshold: { not: null } }] }
        ]
      },
      select: {
        id: true,
        name: true,
        category: true,
        inStock: true,
        stockQuantity: true,
        lowStockThreshold: true,
        lowStockAlertAt: true,
        updatedAt: true
      },
      orderBy: { name: "asc" }
    });
    let alerts = candidates
      .filter((product) => (
        !product.inStock ||
        (product.stockQuantity !== null &&
          product.lowStockThreshold !== null &&
          product.stockQuantity <= product.lowStockThreshold)
      ))
      .map((product) => ({
        ...product,
        alertType: !product.inStock || product.stockQuantity === 0
          ? "OUT_OF_STOCK"
          : "LOW_STOCK"
      }));
    if (search) {
      alerts = alerts.filter((product) => (
        product.name.toLocaleLowerCase().includes(search) ||
        product.category.toLocaleLowerCase().includes(search)
      ));
    }
    const alertType = query.alertType || "ALL";
    if (!["ALL", "LOW_STOCK", "OUT_OF_STOCK"].includes(alertType)) {
      throw new BadRequestException("Unsupported inventory alert filter.");
    }
    if (alertType !== "ALL") alerts = alerts.filter((product) => product.alertType === alertType);
    const sortBy = query.sortBy || "name";
    const order = query.order || "asc";
    if (!["name", "updatedAt", "stockQuantity"].includes(sortBy) || !["asc", "desc"].includes(order)) {
      throw new BadRequestException("Unsupported inventory alert sort option.");
    }
    alerts.sort((left, right) => {
      const leftValue = left[sortBy];
      const rightValue = right[sortBy];
      const comparison = leftValue === null || rightValue === null
        ? leftValue === rightValue ? 0 : leftValue === null ? 1 : -1
        : leftValue instanceof Date && rightValue instanceof Date
          ? leftValue.getTime() - rightValue.getTime()
          : typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue));
      return order === "asc" ? comparison : -comparison;
    });
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 10, 1, 100, "limit");
    const total = alerts.length;
    return {
      data: alerts.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      lowStockCount: alerts.filter((item) => item.alertType === "LOW_STOCK").length,
      outOfStockCount: alerts.filter((item) => item.alertType === "OUT_OF_STOCK").length
    };
  }

  async managerStockHistory(managerId, query = {}) {
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 10, 1, 100, "limit");
    const where = {
      product: { is: { managerId: Number(managerId) } }
    };
    if (query.search) {
      const search = String(query.search).trim();
      if (search.length > 200) throw new BadRequestException("Search term is too long.");
      where.productName = { contains: search };
    }
    const [rows, total] = await Promise.all([
      this.prisma.inventorystockhistory.findMany({
        where,
        select: {
          id: true,
          productName: true,
          previousQuantity: true,
          newQuantity: true,
          quantityChange: true,
          previousInStock: true,
          newInStock: true,
          actionType: true,
          reason: true,
          createdAt: true,
          user: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.inventorystockhistory.count({ where })
    ]);
    return {
      available: true,
      entries: rows.map(({ user, ...entry }) => ({
        ...entry,
        changedBy: user ? { id: user.id, name: user.name } : null
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async list(query = {}, { includeInactive = false, managerId } = {}) {
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 24, 1, 100, "limit");
    const where = {};
    if (query.inStock !== undefined) {
      where.inStock = query.inStock === "true" || query.inStock === true;
    }
    if (managerId !== undefined) {
      const numericManagerId = Number(managerId);
      const managerCondition = { OR: [{ managerId: numericManagerId }, { managerId: null }] };
      if (query.search) {
        const search = String(query.search).trim();
        if (search.length > 200) throw new BadRequestException("Search term is too long.");
        where.AND = [
          managerCondition,
          {
            OR: [
              { name: { contains: search } },
              { description: { contains: search } },
              { category: { contains: search } }
            ]
          }
        ];
      } else {
        where.OR = managerCondition.OR;
      }
    } else if (query.search) {
      const search = String(query.search).trim();
      if (search.length > 200) throw new BadRequestException("Search term is too long.");
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { category: { contains: search } }
      ];
    }
    if (query.category) {
      const category = String(query.category).trim();
      where.category = category;
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const price = {};
      if (query.minPrice !== undefined) price.gte = this.parsePrice(query.minPrice, "minPrice");
      if (query.maxPrice !== undefined) price.lte = this.parsePrice(query.maxPrice, "maxPrice");
      if (price.gte !== undefined && price.lte !== undefined && price.gte > price.lte) {
        throw new BadRequestException("minPrice must not exceed maxPrice.");
      }
      where.price = price;
    }

    const sortBy = query.sortBy || "createdAt";
    const order = query.order || "desc";
    if (!["name", "price", "createdAt"].includes(sortBy) || !["asc", "desc"].includes(order)) {
      throw new BadRequestException("Unsupported product sort option.");
    }
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          manager: { select: { id: true, name: true, email: true } }
        },
        orderBy: { [sortBy]: order },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.product.count({ where })
    ]);
    return {
      data: products.map((product) => productView(product, {
        includeInventory: includeInactive || managerId !== undefined,
        includeAvailability: !includeInactive && managerId === undefined
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      count: total
    };
  }

  async inventorySummary() {
    const [total, inStock, stockAggregate, unknownQuantityCount] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { inStock: true } }),
      this.prisma.product.aggregate({ _sum: { stockQuantity: true } }),
      this.prisma.product.count({ where: { stockQuantity: null } })
    ]);
    return {
      total,
      inStock,
      outOfStock: total - inStock,
      totalKnownStockUnits: stockAggregate._sum.stockQuantity || 0,
      unknownQuantityCount,
      availabilityRate: total ? Math.round((inStock / total) * 100) : 100
    };
  }

  async get(id, { includeAvailability = false } = {}) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    const product = await this.prisma.product.findUnique({
      where: { id: numericId },
      include: { manager: { select: { id: true, name: true, email: true } } }
    });
    if (!product) {
      throw new NotFoundException("Product not found.");
    }
    return productView(product, { includeAvailability });
  }

  async getManagerProduct(id, managerId) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    const product = await this.prisma.product.findFirst({
      where: {
        id: numericId,
        OR: [{ managerId: Number(managerId) }, { managerId: null }]
      },
      include: { manager: { select: { id: true, name: true, email: true } } }
    });
    if (!product) throw new NotFoundException("Assigned product not found.");
    return productView(product, { includeInventory: true });
  }

  async create(input) {
    const data = validateProductInput(input);
    if (Object.hasOwn(data, "managerId")) {
      await this.validateManagerAssignment(data.managerId);
    }
    data.updatedAt = new Date();
    try {
      const product = await this.prisma.product.create({
        data,
        include: { manager: { select: { id: true, name: true, email: true } } }
      });
      return productView(product, { includeInventory: true });
    } catch (error) {
      if (error?.code === "P2002") throw new ConflictException("A product with that name already exists.");
      throw error;
    }
  }

  async update(id, input, actorId = null) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    const data = validateProductInput(input, true);
    if (Object.hasOwn(data, "managerId")) {
      await this.validateManagerAssignment(data.managerId);
    }

    data.updatedAt = new Date();
    try {
      const updateProduct = async (transaction) => {
        const current = await transaction.product.findUnique({ where: { id: numericId } });
        if (!current) throw new NotFoundException("Product not found.");
        if (
          Object.hasOwn(data, "inStock") &&
          current.stockQuantity !== null &&
          data.inStock !== (current.stockQuantity > 0)
        ) {
          throw new BadRequestException("Update the stock quantity instead of changing availability directly.");
        }
        const product = await transaction.product.update({
          where: { id: numericId },
          data,
          include: { manager: { select: { id: true, name: true, email: true } } }
        });
        if (Object.hasOwn(data, "inStock") && current.inStock !== product.inStock) {
          await transaction.inventorystockhistory.create({
            data: {
              productId: current.id,
              userId: Number.isSafeInteger(Number(actorId)) && Number(actorId) > 0
                ? Number(actorId)
                : null,
              productName: current.name,
              previousQuantity: current.stockQuantity,
              newQuantity: product.stockQuantity,
              quantityChange: null,
              previousInStock: current.inStock,
              newInStock: product.inStock,
              actionType: "AVAILABILITY",
              reason: null
            }
          });
        }
        return product;
      };
      const product = typeof this.prisma.$transaction === "function"
        ? await this.prisma.$transaction(updateProduct, { isolationLevel: "Serializable" })
        : await updateProduct(this.prisma);
      return productView(product, { includeInventory: true });
    } catch (error) {
      if (error?.code === "P2002") throw new ConflictException("A product with that name already exists.");
      if (error?.code === "P2034") throw new ConflictException("The product changed concurrently. Refresh and try again.");
      throw error;
    }
  }

  async adjustStock(id, managerId, actorId, input) {
    const numericId = Number(id);
    const numericManagerId = managerId === null || managerId === undefined
      ? null
      : Number(managerId);
    const numericActorId = Number(actorId);
    const validQuantity = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    const addingUnits = Boolean(input && Object.hasOwn(input, "unitsToAdd"));
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      addingUnits === Object.hasOwn(input, "quantity") ||
      !validQuantity(addingUnits ? input.unitsToAdd : input.quantity) ||
      !Object.hasOwn(input, "expectedQuantity") ||
      (input.expectedQuantity !== null && !validQuantity(input.expectedQuantity))
    ) {
      throw new BadRequestException("Provide valid stock units and the quantity last read.");
    }
    if (
      Object.hasOwn(input, "lowStockThreshold") &&
      input.lowStockThreshold !== null &&
      !validQuantity(input.lowStockThreshold)
    ) {
      throw new BadRequestException("The low-stock threshold must be a non-negative integer or null.");
    }
    if (
      Object.hasOwn(input, "reason") &&
      input.reason !== null &&
      (typeof input.reason !== "string" || input.reason.trim().length > 500)
    ) {
      throw new BadRequestException("The stock adjustment reason must be at most 500 characters.");
    }
    const allowed = new Set(["quantity", "unitsToAdd", "expectedQuantity", "lowStockThreshold", "reason"]);
    if (Object.keys(input).some((key) => !allowed.has(key))) {
      throw new BadRequestException("Unsupported stock adjustment field.");
    }
    if (!Number.isSafeInteger(numericActorId) || numericActorId < 1) {
      throw new BadRequestException("An authenticated user is required to adjust stock.");
    }

    try {
      const adjust = async (transaction) => {
        const where = numericManagerId === null
          ? { id: numericId }
          : { id: numericId, OR: [{ managerId: numericManagerId }, { managerId: null }] };
        const current = numericManagerId === null
          ? await transaction.product.findUnique({ where })
          : await transaction.product.findFirst({ where });
        if (!current) throw new NotFoundException("Assigned product not found.");
        if (current.stockQuantity !== input.expectedQuantity) {
          throw new ConflictException("Stock changed since it was loaded. Refresh and try again.");
        }
        if (
          addingUnits &&
          numericManagerId !== null &&
          (!input.reason || !input.reason.trim())
        ) {
          throw new BadRequestException("Provide a reason for adding stock.");
        }
        const newQuantity = addingUnits
          ? (current.stockQuantity ?? 0) + input.unitsToAdd
          : input.quantity;
        if (!validQuantity(newQuantity)) {
          throw new BadRequestException("The resulting stock quantity is invalid.");
        }
        const lowStockThreshold = Object.hasOwn(input, "lowStockThreshold")
          ? input.lowStockThreshold
          : current.lowStockThreshold;
        await applyStockChange(transaction, {
          product: current,
          newQuantity,
          actorId: numericActorId,
          actionType: current.stockQuantity === null
            ? "INITIALIZE"
            : addingUnits
              ? "ADDITION"
              : "ADJUSTMENT",
          reason: input.reason,
          where,
          lowStockThreshold
        });
        return transaction.product.findUnique({
          where: { id: numericId },
          include: { manager: { select: { id: true, name: true, email: true } } }
        });
      };
      const product = typeof this.prisma.$transaction === "function"
        ? await this.prisma.$transaction(adjust, { isolationLevel: "Serializable" })
        : await adjust(this.prisma);
      return productView(product, { includeInventory: true });
    } catch (error) {
      if (error?.code === "P2034") {
        throw new ConflictException("Stock changed concurrently. Refresh and try again.");
      }
      throw error;
    }
  }

  async remove(id) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    await this.get(numericId);
    await this.prisma.product.delete({ where: { id: numericId } });
    return { deleted: true };
  }

  async updateManager(id, managerId) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    await this.get(numericId);
    managerId = await this.validateManagerAssignment(managerId);
    const product = await this.prisma.product.update({
      where: { id: numericId },
      data: { managerId, updatedAt: new Date() },
      include: { manager: { select: { id: true, name: true, email: true } } }
    });
    return productView(product);
  }

  async validateManagerAssignment(managerId) {
    if (managerId === null || managerId === undefined) return null;
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true, role: true }
    });
    if (!manager || !["MANAGER", "INVENTORY_MANAGER"].includes(manager.role)) {
      throw new BadRequestException("Select an existing Manager or Inventory Manager account.");
    }
    return manager.id;
  }

  async getInventoryManagerPermissions(userId) {
    const rows = await this.prisma.inventorymanagerpermission.findMany({
      where: { userId: Number(userId) },
      select: { permission: true }
    });
    return rows.map((row) => row.permission);
  }

  async getCustomerPermissions() {
    return getConfiguredCustomerPermissions(this.prisma);
  }

  async replaceCustomerPermissions(permissions) {
    if (
      !Array.isArray(permissions) ||
      permissions.some((permission) => !CUSTOMER_PERMISSIONS.includes(permission)) ||
      new Set(permissions).size !== permissions.length
    ) {
      throw new BadRequestException("Provide a valid list of Customer permissions.");
    }
    const enabledPermissions = new Set(permissions);
    const updatePermissions = async (transaction) => {
      const updatedAt = new Date();
      await Promise.all(CUSTOMER_PERMISSIONS.map((permission) => {
        const enabled = enabledPermissions.has(permission);
        return transaction.customerpermission.upsert({
          where: { permission },
          create: {
            permission,
            enabled,
            updatedAt
          },
          update: { enabled, updatedAt }
        });
      }));
      return { permissions: [...permissions] };
    };
    if (typeof this.prisma.$transaction === "function") {
      return this.prisma.$transaction(updatePermissions, { isolationLevel: "Serializable" });
    }
    return updatePermissions(this.prisma);
  }

  async setInventoryManagerPermission(userId, permission, enabled) {
    const numericUserId = Number(userId);
    if (
      !Number.isSafeInteger(numericUserId) ||
      numericUserId < 1 ||
      !INVENTORY_MANAGER_PERMISSIONS.includes(permission) ||
      typeof enabled !== "boolean"
    ) {
      throw new BadRequestException("A valid Inventory Manager permission update is required.");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: numericUserId },
      select: { id: true, role: true }
    });
    if (!user) throw new NotFoundException("User not found.");
    if (user.role !== "INVENTORY_MANAGER") {
      throw new BadRequestException("Permissions can only be configured for Inventory Manager accounts.");
    }

    const where = { userId_permission: { userId: numericUserId, permission } };
    if (enabled) {
      await this.prisma.inventorymanagerpermission.upsert({
        where,
        update: {},
        create: { userId: numericUserId, permission }
      });
    } else {
      await this.prisma.inventorymanagerpermission.deleteMany({
        where: { userId: numericUserId, permission }
      });
    }
    return {
      userId: numericUserId,
      permissions: await this.getInventoryManagerPermissions(numericUserId)
    };
  }

  async replaceInventoryManagerPermissions(userId, permissions) {
    const numericUserId = Number(userId);
    if (
      !Number.isSafeInteger(numericUserId) ||
      numericUserId < 1 ||
      !Array.isArray(permissions) ||
      permissions.some((permission) => !INVENTORY_MANAGER_PERMISSIONS.includes(permission)) ||
      new Set(permissions).size !== permissions.length
    ) {
      throw new BadRequestException("Provide a valid list of Inventory Manager permissions.");
    }
    const updatePermissions = async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: numericUserId },
        select: { id: true, role: true }
      });
      if (!user) throw new NotFoundException("User not found.");
      if (user.role !== "INVENTORY_MANAGER") {
        throw new BadRequestException("Permissions can only be configured for Inventory Manager accounts.");
      }
      await transaction.inventorymanagerpermission.deleteMany({
        where: { userId: numericUserId }
      });
      if (permissions.length) {
        await transaction.inventorymanagerpermission.createMany({
          data: permissions.map((permission) => ({ userId: numericUserId, permission }))
        });
      }
      return { userId: numericUserId, permissions: [...permissions] };
    };
    if (typeof this.prisma.$transaction === "function") {
      return this.prisma.$transaction(updatePermissions, { isolationLevel: "Serializable" });
    }
    return updatePermissions(this.prisma);
  }

  async updateInventory(id, managerId, input, actorId = null) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("Inventory update is required.");
    }
    if (!Object.hasOwn(input, "inStock") || typeof input.inStock !== "boolean") {
      throw new BadRequestException("inStock must be a boolean.");
    }
    const updateAvailability = async (transaction) => {
      const current = await transaction.product.findFirst({
        where: {
          id: numericId,
          OR: [{ managerId: Number(managerId) }, { managerId: null }]
        }
      });
      if (!current) throw new NotFoundException("Assigned product not found.");
      if (
        current.stockQuantity !== null &&
        input.inStock !== (current.stockQuantity > 0)
      ) {
        throw new BadRequestException("Update the stock quantity instead of changing availability directly.");
      }
      if (current.inStock !== input.inStock) {
        const result = await transaction.product.updateMany({
          where: {
            id: numericId,
            OR: [{ managerId: Number(managerId) }, { managerId: null }],
            inStock: current.inStock,
            stockQuantity: current.stockQuantity
          },
          data: { inStock: input.inStock, updatedAt: new Date() }
        });
        if (!result.count) {
          throw new ConflictException("Inventory changed concurrently. Refresh and try again.");
        }
        await transaction.inventorystockhistory.create({
          data: {
            productId: current.id,
            userId: Number.isSafeInteger(Number(actorId)) && Number(actorId) > 0
              ? Number(actorId)
              : null,
            productName: current.name,
            previousQuantity: current.stockQuantity,
            newQuantity: current.stockQuantity,
            quantityChange: null,
            previousInStock: current.inStock,
            newInStock: input.inStock,
            actionType: "AVAILABILITY",
            reason: null
          }
        });
      }
    };
    try {
      if (typeof this.prisma.$transaction === "function") {
        await this.prisma.$transaction(updateAvailability, { isolationLevel: "Serializable" });
      } else {
        await updateAvailability(this.prisma);
      }
    } catch (error) {
      if (error?.code === "P2034") {
        throw new ConflictException("Inventory changed concurrently. Refresh and try again.");
      }
      throw error;
    }
    return this.getManagerProduct(numericId, managerId);
  }

  async createManagerProduct(managerId, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("A product object is required.");
    }
    const allowed = new Set([
      "name",
      "description",
      "price",
      "category",
      "imageUrl",
      "imagePublicId"
    ]);
    if (Object.keys(input).some((key) => !allowed.has(key))) {
      throw new BadRequestException("Only product details can be provided.");
    }
    return this.create({
      ...input,
      inStock: true,
      managerId: Number(managerId)
    });
  }

  async updateManagerProduct(id, managerId, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("A product update is required.");
    }
    const allowed = new Set([
      "name",
      "description",
      "price",
      "category",
      "imageUrl",
      "imagePublicId"
    ]);
    if (Object.keys(input).some((key) => !allowed.has(key))) {
      throw new BadRequestException("Only product details can be changed.");
    }
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    const data = validateProductInput(input, true);
    data.updatedAt = new Date();
    const result = await this.prisma.product.updateMany({
      where: { id: numericId, managerId: Number(managerId) },
      data
    });
    if (!result.count) throw new NotFoundException("Assigned product not found.");
    return this.getManagerProduct(numericId, managerId);
  }

  async removeManagerProduct(id, managerId) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      throw new BadRequestException("Product ID is invalid.");
    }
    let result;
    try {
      result = await this.prisma.product.deleteMany({
        where: { id: numericId, managerId: Number(managerId) }
      });
    } catch (error) {
      if (error?.code === "P2003") {
        throw new ConflictException("This product is referenced by existing orders or cart items and cannot be deleted.");
      }
      throw error;
    }
    if (!result.count) throw new NotFoundException("Assigned product not found.");
    return { deleted: true };
  }

  async resetUserPassword(userId, password) {
    const numericUserId = Number(userId);
    if (
      !Number.isSafeInteger(numericUserId) ||
      numericUserId < 1 ||
      typeof password !== "string" ||
      Array.from(password).length < 8 ||
      Buffer.byteLength(password, "utf8") > 1024
    ) {
      throw new BadRequestException("Provide a valid user ID and a password of at least 8 characters.");
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({
          where: { id: numericUserId },
          data: { passwordHash: await bcrypt.hash(password, 12), updatedAt: new Date() },
          select: { id: true, name: true, email: true, role: true }
        });
        await transaction.session.deleteMany({ where: { userId: numericUserId } });
        return user;
      });
    } catch (error) {
      if (error?.code === "P2025") throw new NotFoundException("User not found.");
      throw error;
    }
  }

  async updateUserRole(userId, role) {
    const numUserId = Number(userId);
    if (!Number.isSafeInteger(numUserId) || numUserId < 1 || !["CUSTOMER", "ADMIN", "MANAGER", "INVENTORY_MANAGER"].includes(role)) {
      throw new BadRequestException("A valid user ID and role are required.");
    }

    try {
      const updateRole = async (transaction) => {
        const existing = await transaction.user.findUnique({
          where: { id: numUserId },
          select: { id: true, name: true, email: true, role: true, emailVerifiedAt: true }
        });
        if (!existing) throw new NotFoundException("User not found.");
        if (existing.role === "ADMIN" && role !== "ADMIN") {
          const administratorCount = await transaction.user.count({ where: { role: "ADMIN" } });
          if (administratorCount <= 1) {
            throw new ConflictException("The last administrator cannot be removed.");
          }
        }
        return transaction.user.update({
          where: { id: numUserId },
          data: { role, updatedAt: new Date() },
          select: { id: true, name: true, email: true, role: true, emailVerifiedAt: true }
        });
      };
      const user = typeof this.prisma.$transaction === "function"
        ? await this.prisma.$transaction(updateRole, { isolationLevel: "Serializable" })
        : await updateRole(this.prisma);
      return user;
    } catch (error) {
      if (error?.code === "P2025") throw new NotFoundException("User not found.");
      throw error;
    }
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
        inventoryPermissions: { select: { permission: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return users.map(({ inventoryPermissions, ...user }) => ({
      ...user,
      inventoryPermissions: inventoryPermissions.map(({ permission }) => permission)
    }));
  }

  parsePrice(value, field) {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0 || price > 99999999.99) {
      throw new BadRequestException(`${field} must be a non-negative amount.`);
    }
    return price;
  }

  parseInteger(value, fallback, minimum, maximum, field) {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new BadRequestException(`${field} must be an integer between ${minimum} and ${maximum}.`);
    }
    return parsed;
  }
}

Inject(PrismaService)(ProductService, undefined, 0);
Injectable()(ProductService);

module.exports = {
  INVENTORY_MANAGER_PERMISSIONS,
  ProductService,
  productView,
  validateProductInput,
  PRODUCT_FIELDS
};
