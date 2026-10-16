const {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  ServiceUnavailableException,
  BadGatewayException
} = require("@nestjs/common");
const { createHash } = require("node:crypto");
const { PrismaService } = require("../prisma/prisma.service");
const { getStoreSettings, updateStoreSettings } = require("./store-settings");

const ORDER_STATUSES = [
  "PAYMENT_PENDING",
  "PAID",
  "PAYMENT_FAILED",
  "CANCELLED"
];
const PRODUCT_IMAGE_FOLDER = "shopsphere/products";
const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

function rangeStart(range) {
  const days = { "7d": 7, "30d": 30, "90d": 90 }[range];
  if (!days && range !== "all" && range !== undefined) {
    throw new BadRequestException("Report range must be 7d, 30d, 90d, or all.");
  }
  if (!days) return undefined;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return start;
}

function utcDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function salesTimeline(orders, verified, range, start) {
  const monthly = range === "all";
  const keyFor = (date) => {
    const day = utcDay(date);
    return monthly ? day.slice(0, 7) : day;
  };
  const sales = new Map();
  for (const order of verified) {
    const key = keyFor(order.createdAt);
    const point = sales.get(key) || { revenue: 0, salesCount: 0, unitsSold: 0 };
    point.revenue += Number(order.totalAmount);
    point.salesCount += 1;
    point.unitsSold += order.orderitem.reduce((sum, item) => sum + item.quantity, 0);
    sales.set(key, point);
  }

  let firstDate;
  let lastDate;
  if (monthly) {
    const timestamps = orders
      .map(({ createdAt }) => new Date(createdAt).getTime())
      .filter(Number.isFinite);
    if (timestamps.length) {
      let earliest = timestamps[0];
      let latest = timestamps[0];
      for (const timestamp of timestamps.slice(1)) {
        earliest = Math.min(earliest, timestamp);
        latest = Math.max(latest, timestamp);
      }
      firstDate = new Date(earliest);
      lastDate = new Date(latest);
      firstDate = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1));
      lastDate = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 1));
    }
  } else {
    firstDate = start;
    lastDate = new Date();
    lastDate.setUTCHours(0, 0, 0, 0);
  }
  if (!firstDate || !lastDate) return [];

  const result = [];
  const cursor = new Date(firstDate);
  while (cursor <= lastDate) {
    const date = monthly
      ? `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`
      : utcDay(cursor);
    const point = sales.get(date) || { revenue: 0, salesCount: 0, unitsSold: 0 };
    result.push({
      date,
      revenue: Math.round(point.revenue * 100) / 100,
      salesCount: point.salesCount,
      unitsSold: point.unitsSold
    });
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function couponInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestException("A coupon object is required.");
  }
  const allowed = new Set([
    "code",
    "discount",
    "discountType",
    "minSpend",
    "startsAt",
    "expiresAt",
    "usageLimit",
    "description"
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new BadRequestException("Coupon fields are invalid.");
  }
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{3,50}$/.test(code)) {
    throw new BadRequestException("Coupon code must be 3 to 50 letters, numbers, underscores, or hyphens.");
  }
  const discountType = input.discountType === undefined ? "PERCENTAGE" : input.discountType;
  if (!["PERCENTAGE", "FIXED"].includes(discountType)) {
    throw new BadRequestException("Discount type must be PERCENTAGE or FIXED.");
  }
  if (
    !Number.isSafeInteger(input.discount) ||
    input.discount < 1 ||
    (discountType === "PERCENTAGE" && input.discount > 100)
  ) {
    throw new BadRequestException(
      discountType === "PERCENTAGE"
        ? "Percentage discount must be an integer between 1 and 100."
        : "Fixed discount must be a positive whole INR amount."
    );
  }
  const minSpend = input.minSpend === undefined ? 0 : Number(input.minSpend);
  if (!Number.isFinite(minSpend) || minSpend < 0 || minSpend > 99999999.99) {
    throw new BadRequestException("Minimum spend must be a non-negative amount.");
  }
  function optionalDate(value, label) {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(value);
    if (typeof value !== "string" || !Number.isFinite(date.getTime())) {
      throw new BadRequestException(`${label} must be a valid date.`);
    }
    return date;
  }
  const startsAt = optionalDate(input.startsAt, "Start date");
  const expiresAt = optionalDate(input.expiresAt, "Expiry date");
  if (startsAt && expiresAt && startsAt >= expiresAt) {
    throw new BadRequestException("Expiry date must be after the start date.");
  }
  const usageLimit = input.usageLimit === undefined || input.usageLimit === null || input.usageLimit === ""
    ? null
    : Number(input.usageLimit);
  if (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 1)) {
    throw new BadRequestException("Usage limit must be a positive whole number.");
  }
  let description = input.description === undefined ? null : input.description;
  if (description !== null) {
    if (typeof description !== "string" || description.trim().length > 255) {
      throw new BadRequestException("Coupon description must be at most 255 characters.");
    }
    description = description.trim() || null;
  }
  return {
    code,
    discount: input.discount,
    discountType,
    minSpend,
    startsAt,
    expiresAt,
    usageLimit,
    description
  };
}

class AdminService {
  constructor(prismaService) {
    this.prisma = prismaService.client;
  }

  async databaseInventory() {
    const databaseRows = await this.prisma.$queryRaw`SELECT DATABASE() AS databaseName`;
    const databaseName = databaseRows[0]?.databaseName;
    const tables = await this.prisma.$queryRaw`
      SELECT TABLE_NAME AS tableName
      FROM information_schema.tables
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;
    const inventory = await Promise.all(tables.map(async ({ tableName }) => {
      const identifier = `\`${String(tableName).replace(/`/g, "``")}\``;
      const rows = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS rowCount FROM ${identifier}`
      );
      return { name: tableName, rowCount: String(rows[0].rowCount) };
    }));
    return { databaseName, tables: inventory };
  }

  async customers(query = {}) {
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 10, 1, 100, "limit");
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: "CUSTOMER" },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerifiedAt: true,
          order: {
            select: {
              status: true,
              totalAmount: true,
              payment: { select: { status: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      this.prisma.user.count({ where: { role: "CUSTOMER" } })
    ]);
    return {
      data: users.map((user) => {
        const verifiedOrders = user.order.filter(
          (order) => order.status === "PAID" && order.payment?.status === "CAPTURED"
        );
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerifiedAt: user.emailVerifiedAt,
          totalOrders: user.order.length,
          paidOrdersCount: verifiedOrders.length,
          totalSpent: Math.round(
            verifiedOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0) * 100
          ) / 100
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async customerDetails(value) {
    const userId = this.parseId(value, "Customer");
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        emailVerifiedAt: true,
        order: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            currency: true,
            shippingAddress: true,
            createdAt: true,
            payment: { select: { status: true, razorpayPaymentId: true } },
            orderitem: {
              select: {
                id: true,
                productName: true,
                quantity: true,
                unitPrice: true
              }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!user) throw new NotFoundException("Customer not found.");
    const verifiedOrders = user.order.filter(
      (order) => order.status === "PAID" && order.payment?.status === "CAPTURED"
    );
    const totalSpent = Math.round(
      verifiedOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0) * 100
    ) / 100;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: Boolean(user.emailVerifiedAt),
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      totalOrders: user.order.length,
      paidOrdersCount: verifiedOrders.length,
      totalSpent,
      orders: user.order.map((o) => ({
        id: o.id,
        status: o.status,
        totalAmount: Number(o.totalAmount),
        currency: o.currency,
        createdAt: o.createdAt,
        paymentStatus: o.payment?.status || "NONE",
        itemCount: o.orderitem.reduce((sum, item) => sum + item.quantity, 0),
        items: o.orderitem.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice)
        }))
      }))
    };
  }

  async updateCustomerStatus(value, input) {
    const userId = this.parseId(value, "Customer");
    if (!input || typeof input.active !== "boolean") {
      throw new BadRequestException("Provide a boolean active status.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Customer not found.");
    if (user.role === "ADMIN") {
      throw new BadRequestException("Administrator accounts cannot be deactivated.");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (!input.active) {
        await tx.session.deleteMany({ where: { userId } });
      }
      return tx.user.update({
        where: { id: userId },
        data: {
          emailVerifiedAt: input.active ? (user.emailVerifiedAt || new Date()) : null,
          updatedAt: new Date()
        },
        select: { id: true, name: true, email: true, role: true, emailVerifiedAt: true }
      });
    });
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      isActive: Boolean(updated.emailVerifiedAt),
      emailVerifiedAt: updated.emailVerifiedAt
    };
  }

  async listCoupons(query = {}) {
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 10, 1, 100, "limit");
    const skip = (page - 1) * limit;
    const [coupons, total] = await Promise.all([
      this.prisma.coupon.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      this.prisma.coupon.count()
    ]);
    return {
      data: coupons,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async createCoupon(input) {
    try {
      return await this.prisma.coupon.create({
        data: {
          ...couponInput(input),
          isActive: true,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictException("A coupon with that code already exists.");
      }
      throw error;
    }
  }

  async updateCoupon(value, input) {
    const id = this.parseId(value, "Coupon");
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Coupon not found.");
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("A coupon update object is required.");
    }
    const data = { updatedAt: new Date() };
    if (input.code !== undefined) {
      const code = String(input.code).trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,50}$/.test(code)) {
        throw new BadRequestException("Coupon code must be 3 to 50 letters, numbers, underscores, or hyphens.");
      }
      data.code = code;
    }
    if (input.discountType !== undefined) {
      if (!["PERCENTAGE", "FIXED"].includes(input.discountType)) {
        throw new BadRequestException("Discount type must be PERCENTAGE or FIXED.");
      }
      data.discountType = input.discountType;
    }
    if (input.discount !== undefined) {
      const type = data.discountType || existing.discountType;
      if (!Number.isSafeInteger(input.discount) || input.discount < 1 || (type === "PERCENTAGE" && input.discount > 100)) {
        throw new BadRequestException("Discount must be between 1 and 100 for percentage or positive for fixed.");
      }
      data.discount = input.discount;
    }
    if (input.minSpend !== undefined) {
      const minSpend = Number(input.minSpend);
      if (!Number.isFinite(minSpend) || minSpend < 0) {
        throw new BadRequestException("Minimum spend must be a non-negative amount.");
      }
      data.minSpend = minSpend;
    }
    if (input.isActive !== undefined) {
      if (typeof input.isActive !== "boolean") {
        throw new BadRequestException("isActive must be a boolean.");
      }
      data.isActive = input.isActive;
    }
    if (input.startsAt !== undefined) {
      data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    }
    if (input.expiresAt !== undefined) {
      data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    }
    if (input.usageLimit !== undefined) {
      data.usageLimit = input.usageLimit ? Number(input.usageLimit) : null;
    }
    if (input.description !== undefined) {
      data.description = input.description ? String(input.description).trim() : null;
    }
    try {
      return await this.prisma.coupon.update({
        where: { id },
        data
      });
    } catch (error) {
      if (error?.code === "P2002") throw new ConflictException("A coupon with that code already exists.");
      throw error;
    }
  }

  async deleteCoupon(value) {
    const id = this.parseId(value, "Coupon");
    try {
      await this.prisma.coupon.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (error?.code === "P2025") throw new NotFoundException("Coupon not found.");
      throw error;
    }
  }

  cloudinaryConfig() {
    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException("Product image storage is not configured.");
    }
    return { cloudName, apiKey, apiSecret };
  }

  cloudinarySignature(parameters, apiSecret) {
    const serialized = Object.entries(parameters)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    return createHash("sha1").update(`${serialized}${apiSecret}`).digest("hex");
  }

  async readProductImage(request, expectedType) {
    const declaredLength = Number(request.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PRODUCT_IMAGE_SIZE) {
      throw new BadRequestException("Product images must be 5 MB or smaller.");
    }

    const chunks = [];
    let size = 0;
    let tooLarge = false;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_PRODUCT_IMAGE_SIZE) {
        tooLarge = true;
        chunks.length = 0;
        continue;
      }
      if (!tooLarge) chunks.push(Buffer.from(chunk));
    }
    if (tooLarge) {
      throw new BadRequestException("Product images must be 5 MB or smaller.");
    }
    if (size === 0) throw new BadRequestException("An image file is required.");
    if (request.headers["content-type"]?.toLowerCase() !== expectedType) {
      throw new BadRequestException("The uploaded image content type changed during upload.");
    }
    return Buffer.concat(chunks, size);
  }

  async uploadProductImage(request) {
    const contentType = String(request.headers["content-type"] || "").toLowerCase();
    const extension = PRODUCT_IMAGE_TYPES.get(contentType);
    if (!extension) {
      throw new BadRequestException("Choose a JPG, PNG, or WebP image.");
    }
    const file = await this.readProductImage(request, contentType);
    const { cloudName, apiKey, apiSecret } = this.cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const parameters = { folder: PRODUCT_IMAGE_FOLDER, timestamp };
    const form = new FormData();
    form.append(
      "file",
      new Blob([file], { type: contentType }),
      `product-${timestamp}.${extension}`
    );
    form.append("folder", PRODUCT_IMAGE_FOLDER);
    form.append("timestamp", String(timestamp));
    form.append("api_key", apiKey);
    form.append("signature", this.cloudinarySignature(parameters, apiSecret));

    let response;
    try {
      response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        { method: "POST", body: form, signal: AbortSignal.timeout(30000) }
      );
    } catch (error) {
      throw new BadGatewayException("Product image storage could not be reached.");
    }
    if (!response.ok) {
      throw new BadGatewayException("Product image storage rejected the upload.");
    }
    const asset = await response.json();
    if (
      typeof asset.secure_url !== "string" ||
      !asset.secure_url.startsWith("https://") ||
      typeof asset.public_id !== "string" ||
      !asset.public_id.startsWith(`${PRODUCT_IMAGE_FOLDER}/`)
    ) {
      throw new BadGatewayException("Product image storage returned an invalid asset.");
    }
    return { imageUrl: asset.secure_url, imagePublicId: asset.public_id };
  }

  async deleteProductImage(input) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      typeof input.imagePublicId !== "string" ||
      !/^shopsphere\/products\/[A-Za-z0-9_-]+$/.test(input.imagePublicId)
    ) {
      throw new BadRequestException("Product image public ID is invalid.");
    }
    const { cloudName, apiKey, apiSecret } = this.cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const parameters = { public_id: input.imagePublicId, timestamp };
    const form = new URLSearchParams({
      ...parameters,
      api_key: apiKey,
      signature: this.cloudinarySignature(parameters, apiSecret)
    });

    let response;
    try {
      response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form,
          signal: AbortSignal.timeout(30000)
        }
      );
    } catch (error) {
      throw new BadGatewayException("Product image storage could not be reached.");
    }
    if (!response.ok) {
      throw new BadGatewayException("Product image storage rejected the deletion.");
    }
    const result = await response.json();
    if (result.result !== "ok" && result.result !== "not found") {
      throw new BadGatewayException("Product image storage could not delete the asset.");
    }
    return { deleted: true };
  }

  async reports(query = {}) {
    const start = rangeStart(query.range || "30d");
    const where = start ? { createdAt: { gte: start } } : {};
    const [orders, totalProducts, inStockProducts, totalCustomers] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          payment: { select: { status: true } },
          orderitem: {
            select: {
              productName: true,
              quantity: true,
              unitPrice: true,
              product: { select: { category: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { inStock: true } }),
      this.prisma.user.count({ where: { role: "CUSTOMER" } })
    ]);

    const verified = orders.filter(
      (order) => order.status === "PAID" && order.payment?.status === "CAPTURED"
    );
    const totalRevenue = verified.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0
    );
    const metrics = {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders: orders.length,
      totalCustomers,
      totalProducts,
      inStockProducts,
      outOfStockProducts: totalProducts - inStockProducts,
      pendingOrders: orders.filter((order) => order.status === "PAYMENT_PENDING").length,
      completedOrders: verified.length,
      failedOrders: orders.filter((order) => order.status === "PAYMENT_FAILED").length,
      averageOrderValue: verified.length
        ? Math.round((totalRevenue / verified.length) * 100) / 100
        : 0
    };

    const products = new Map();
    for (const order of verified) {
      for (const item of order.orderitem) {
        const current = products.get(item.productName) || {
          name: item.productName,
          unitsSold: 0,
          revenue: 0,
          category: item.product?.category || "Uncategorized"
        };
        current.unitsSold += item.quantity;
        current.revenue += Number(item.unitPrice) * item.quantity;
        products.set(item.productName, current);
      }
    }
    const salesOverTime = salesTimeline(orders, verified, query.range || "30d", start);
    const bestSellingProducts = [...products.values()]
      .map((product) => ({
        ...product,
        revenue: Math.round(product.revenue * 100) / 100
      }))
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5);
    const statuses = new Map(ORDER_STATUSES.map((status) => [status, 0]));
    for (const order of orders) statuses.set(order.status, (statuses.get(order.status) || 0) + 1);
    const orderStatusDistribution = [
      { name: "Paid", status: "PAID", color: "#16a34a" },
      { name: "Pending", status: "PAYMENT_PENDING", color: "#f59e0b" },
      { name: "Failed", status: "PAYMENT_FAILED", color: "#ef4444" },
      { name: "Cancelled", status: "CANCELLED", color: "#71717a" }
    ].map((entry) => ({ ...entry, value: statuses.get(entry.status) || 0 }));

    const recentOrders = orders.slice(0, 8).map((order) => ({
      id: order.id,
      customerName: order.user.name,
      customerEmail: order.user.email,
      itemCount: order.orderitem.reduce((count, item) => count + item.quantity, 0),
      totalAmount: Number(order.totalAmount),
      status: order.status,
      createdAt: order.createdAt
    }));
    return {
      metrics,
      salesOverTime,
      orderStatusDistribution,
      recentOrders,
      bestSellingProducts
    };
  }

  async overview(query) {
    const report = await this.reports(query);
    const lowStockProducts = await this.prisma.product.findMany({
      where: { inStock: false },
      select: { id: true, name: true, category: true, price: true, inStock: true },
      take: 8
    });
    const totalCategories = await this.prisma.category.count();
    return {
      ...report,
      products: report.metrics.totalProducts,
      activeProducts: report.metrics.inStockProducts,
      users: report.metrics.totalCustomers,
      categories: totalCategories,
      managers: await this.prisma.user.count({ where: { role: "MANAGER" } }),
      lowStockProducts,
      lowStockCount: lowStockProducts.length
    };
  }

  getSettings() {
    return getStoreSettings();
  }

  updateSettings(input) {
    return updateStoreSettings(input);
  }

  parseInteger(value, fallback, minimum, maximum, field) {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new BadRequestException(`${field} must be between ${minimum} and ${maximum}.`);
    }
    return parsed;
  }

  parseId(value, label) {
    if (
      typeof value !== "string" ||
      !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value))
    ) {
      throw new BadRequestException(`${label} ID is invalid.`);
    }
    return Number(value);
  }
}

Inject(PrismaService)(AdminService, undefined, 0);
Injectable()(AdminService);

module.exports = { AdminService, couponInput, rangeStart, salesTimeline };
