const {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards
} = require("@nestjs/common");
const multer = require("multer");
const { parseImportFile } = require("../utils/file-parser");
const { validateImportRows } = require("../products/product-import-validator");
const { detectDuplicates, generateDuplicateSummary } = require("../products/product-duplicate-detector");

// Configure multer for memory storage (preview-only, no disk write)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const allowedMimeTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];

    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    const isValidExtension = allowedExtensions.includes(ext);
    const isValidMimeType = allowedMimeTypes.includes(file.mimetype);

    if (isValidExtension || isValidMimeType) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});
const { AuthModule } = require("../auth/auth.module");
const { AdminRoleGuard } = require("../categories/category.controller");
const { CsrfGuard, SessionAuthGuard } = require("../auth/auth-security");
const { ProductService } = require("./product.service");

const LEGACY_MANAGER_PERMISSIONS = [
  "VIEW_INVENTORY_DASHBOARD",
  "VIEW_PRODUCTS",
  "VIEW_PRODUCT_DETAILS",
  "VIEW_STOCK_LEVELS",
  "UPDATE_INVENTORY"
];

function validateId(value) {
  const raw = typeof value === "object" && value !== null ? value.id : value;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new BadRequestException("Product ID is invalid.");
  }
  return id;
}

function managerProductView(product, permissions) {
  const visibleProduct = { ...product };
  delete visibleProduct.manager;
  if (!permissions.includes("VIEW_PRODUCTS")) {
    delete visibleProduct.category;
    delete visibleProduct.price;
  }
  if (!permissions.includes("VIEW_PRODUCT_DETAILS")) delete visibleProduct.description;
  if (!permissions.includes("VIEW_LOW_STOCK_ALERTS")) delete visibleProduct.lowStockAlertAt;
  const canViewInventory = [
    "VIEW_STOCK_LEVELS",
    "VIEW_LOW_STOCK_ALERTS",
    "MANAGE_STOCK_ALERTS",
    "VIEW_STOCK_HISTORY",
    "VIEW_INVENTORY_REPORTS"
  ].some((permission) => permissions.includes(permission));
  if (!canViewInventory) {
    delete visibleProduct.inStock;
    delete visibleProduct.stockQuantity;
    delete visibleProduct.lowStockThreshold;
  } else if (
    !permissions.includes("VIEW_LOW_STOCK_ALERTS") &&
    !permissions.includes("MANAGE_STOCK_ALERTS") &&
    !permissions.includes("VIEW_INVENTORY_REPORTS")
  ) {
    delete visibleProduct.lowStockThreshold;
  }
  return visibleProduct;
}

function roleGuard(role) {
  return class RoleGuard {
    canActivate(context) {
      const request = context.switchToHttp().getRequest();
      const actualRole = request.user?.role;
      const allowed = role === "MANAGER"
        ? ["MANAGER", "INVENTORY_MANAGER"].includes(actualRole)
        : actualRole === role;
      if (!allowed) {
        throw new ForbiddenException(`${role === "ADMIN" ? "Administrator" : "Manager"} access required.`);
      }
      return true;
    }
  };
}

class ProductController {
  constructor(products) {
    this.products = products;
  }

  async list(query, response) {
    const result = await this.products.list(query);
    response.status(200).json(result);
  }

  async get(id, response) {
    response.status(200).json({
      data: await this.products.get(validateId(id), { includeAvailability: true })
    });
  }

  async create(body, response) {
    response.status(201).json({ data: await this.products.create(body) });
  }

  async update(id, body, request, response) {
    response.status(200).json({
      data: await this.products.update(validateId(id), body, request?.user?.id)
    });
  }

  async remove(id, response) {
    response.status(200).json({
      data: await this.products.remove(validateId(id))
    });
  }

  async adminList(query, response) {
    const result = await this.products.list(query, { includeInactive: true });
    response.status(200).json(result);
  }

  async adminInventory(query, response) {
    const result = await this.products.list(query, { includeInactive: true });
    response.status(200).json(result);
  }

  async adminInventorySummary(response) {
    response.status(200).json({ data: await this.products.inventorySummary() });
  }

  async updateAdminInventory(id, body, request, response) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.inStock !== "boolean"
    ) {
      throw new BadRequestException("Provide a boolean inStock value.");
    }
    response.status(200).json({
      data: await this.products.update(validateId(id), { inStock: body.inStock }, request?.user?.id)
    });
  }

  async updateAdminStock(id, body, request, response) {
    const productId = validateId(id);
    response.status(200).json({
      data: await this.products.adjustStock(productId, null, request.user.id, body)
    });
  }

  async users(response) {
    response.status(200).json({ data: await this.products.listUsers() });
  }

  async updateRole(id, body, request, response) {
    const userId = typeof id === "object" && id !== null ? id.id : id;
    if (request?.user?.id && Number(userId) === Number(request.user.id) && body?.role !== "ADMIN") {
      throw new BadRequestException("You cannot remove your own administrative access.");
    }
    const targetResponse = response || request;
    targetResponse.status(200).json({
      data: await this.products.updateUserRole(Number(userId), body?.role)
    });
  }

  async resetUserPassword(id, body, response) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.password !== "string"
    ) {
      throw new BadRequestException("Provide only a new password.");
    }
    const userId = typeof id === "object" && id !== null ? id.id : id;
    response.status(200).json({
      data: await this.products.resetUserPassword(userId, body.password)
    });
  }

  async updateInventoryManagerPermission(id, permission, body, response) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.enabled !== "boolean"
    ) {
      throw new BadRequestException("Provide a boolean enabled value.");
    }
    const userId = typeof id === "object" && id !== null ? id.id : id;
    const permissionKey = typeof permission === "object" && permission !== null
      ? permission.permission
      : permission;
    response.status(200).json({
      data: await this.products.setInventoryManagerPermission(userId, permissionKey, body.enabled)
    });
  }

  async replaceInventoryManagerPermissions(id, body, response) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Array.isArray(body.permissions)
    ) {
      throw new BadRequestException("Provide only a permissions array.");
    }
    const userId = typeof id === "object" && id !== null ? id.id : id;
    response.status(200).json({
      data: await this.products.replaceInventoryManagerPermissions(userId, body.permissions)
    });
  }

  async customerPermissions(response) {
    response.status(200).json({
      data: { permissions: await this.products.getCustomerPermissions() }
    });
  }

  async replaceCustomerPermissions(body, response) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Array.isArray(body.permissions)
    ) {
      throw new BadRequestException("Provide only a permissions array.");
    }
    response.status(200).json({
      data: await this.products.replaceCustomerPermissions(body.permissions)
    });
  }

  async assignManager(id, body, response) {
    if (
      !body ||
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, "managerId") ||
      (body.managerId !== null && (!Number.isSafeInteger(body.managerId) || body.managerId < 1))
    ) {
      throw new BadRequestException("managerId must be a positive integer or null.");
    }
    response.status(200).json({
      data: await this.products.updateManager(validateId(id), body.managerId)
    });
  }

  async managerProducts(request, query, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("VIEW_PRODUCTS") && !permissions.includes("VIEW_STOCK_LEVELS")) {
      throw new ForbiddenException("You do not have permission to view products or inventory.");
    }
    const result = await this.products.list(query, {
      includeInactive: true,
      managerId: request.user.id
    });
    result.data = result.data.map((product) => managerProductView(product, permissions));
    result.permissions = permissions;
    response.status(200).json(result);
  }

  async managerAccess(request, response) {
    response.status(200).json({
      data: { permissions: await this.managerPermissions(request) }
    });
  }

  async managerDashboard(request, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("VIEW_INVENTORY_DASHBOARD")) {
      throw new ForbiddenException("You do not have permission to view the inventory dashboard.");
    }
    const canViewStatistics = permissions.includes("VIEW_DASHBOARD_STATISTICS");
    const statistics = canViewStatistics &&
      (permissions.includes("VIEW_PRODUCTS") || permissions.includes("VIEW_STOCK_LEVELS"))
      ? await this.products.managerInventoryStats(
          request.user.id,
          permissions.includes("VIEW_STOCK_LEVELS")
        )
      : null;
    const recentActivity = permissions.includes("VIEW_ORDERS")
      ? await this.products.listManagerRecentOrders(
          request.user.id,
          permissions.includes("VIEW_ORDER_DETAILS")
        )
      : undefined;
    const recentStockUpdates = permissions.includes("VIEW_STOCK_HISTORY")
      ? await this.products.managerStockHistory(request.user.id, { page: "1", limit: "5" })
      : undefined;
    response.status(200).json({
      data: {
        statisticsVisible: canViewStatistics,
        assignedProductCount: statistics?.assignedProductCount ?? null,
        stockLevelsVisible: canViewStatistics && permissions.includes("VIEW_STOCK_LEVELS"),
        availableProductCount: statistics?.availableProductCount ?? null,
        outOfStockCount: statistics?.outOfStockCount ?? null,
        totalKnownStockUnits: statistics?.totalKnownStockUnits ?? null,
        unknownQuantityProductCount: statistics?.unknownQuantityProductCount ?? null,
        ...(recentStockUpdates ? { recentStockUpdates: recentStockUpdates.entries } : {}),
        ...(recentActivity ? { recentActivity } : {})
      }
    });
  }

  async managerInventoryAlerts(request, query, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("VIEW_LOW_STOCK_ALERTS")) {
      throw new ForbiddenException("You do not have permission to view inventory alerts.");
    }
    const result = await this.products.managerInventoryAlerts(request.user.id, query);
    const { data: alerts, ...summary } = result;
    response.status(200).json({
      data: {
        ...summary,
        alerts: alerts.map((product) => managerProductView(product, permissions))
      }
    });
  }

  async managerStockHistory(request, query, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("VIEW_STOCK_HISTORY")) {
      throw new ForbiddenException("You do not have permission to view stock history.");
    }
    response.status(200).json({
      data: await this.products.managerStockHistory(request.user.id, query)
    });
  }

  async managerInventoryReport(request, query, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("VIEW_INVENTORY_REPORTS")) {
      throw new ForbiddenException("You do not have permission to view inventory reports.");
    }
    response.status(200).json({
      data: await this.products.managerInventoryReport(request.user.id, query)
    });
  }

  async exportManagerInventoryReport(request, query, response) {
    const permissions = await this.managerPermissions(request);
    if (
      !permissions.includes("VIEW_INVENTORY_REPORTS") ||
      !permissions.includes("EXPORT_INVENTORY_REPORTS")
    ) {
      throw new ForbiddenException("You do not have permission to export inventory reports.");
    }
    const report = await this.products.managerInventoryReport(request.user.id, {
      ...query,
      page: "1"
    });
    const products = [...report.products];
    for (let page = 2; page <= report.pagination.totalPages; page += 1) {
      const next = await this.products.managerInventoryReport(request.user.id, {
        ...query,
        page: String(page)
      });
      products.push(...next.products);
    }
    const rows = [
      ["Product", "Category", "Stock quantity", "Low-stock threshold", "Availability", "Last updated"],
      ...products.map((product) => [
        product.name,
        product.category,
        product.stockQuantity ?? "",
        product.lowStockThreshold ?? "",
        product.inStock ? "In stock" : "Out of stock",
        product.updatedAt ? new Date(product.updatedAt).toISOString() : ""
      ])
    ];
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value ?? "");
      return `"${text.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    response
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="shopsphere-inventory-report.csv"')
      .send(csv);
  }

  async createManagerProduct(request, body, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("CREATE_PRODUCTS")) {
      throw new ForbiddenException("You do not have permission to create products.");
    }
    this.assertManagerImagePermission(body, permissions);
    response.status(201).json({
      data: managerProductView(
        await this.products.createManagerProduct(request.user.id, body),
        permissions
      )
    });
  }

  async editManagerProduct(request, id, body, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("EDIT_PRODUCTS")) {
      throw new ForbiddenException("You do not have permission to edit products.");
    }
    this.assertManagerImagePermission(body, permissions);
    const productId = typeof id === "object" && id !== null ? id.id : id;
    response.status(200).json({
      data: managerProductView(
        await this.products.updateManagerProduct(productId, request.user.id, body),
        permissions
      )
    });
  }

  assertManagerImagePermission(body, permissions) {
    const hasImageUrl = body && Object.hasOwn(body, "imageUrl");
    const hasPublicId = body && Object.hasOwn(body, "imagePublicId");
    if ((hasImageUrl || hasPublicId) && !permissions.includes("UPLOAD_PRODUCT_IMAGES")) {
      throw new ForbiddenException("You do not have permission to upload product images.");
    }
    if (!hasImageUrl && !hasPublicId) return;
    if (hasImageUrl !== hasPublicId) {
      throw new BadRequestException("Both uploaded image fields are required.");
    }
    if (body.imageUrl === null && body.imagePublicId === null) return;
    let imageUrl;
    try {
      imageUrl = new URL(body.imageUrl);
    } catch {
      throw new BadRequestException("The uploaded image URL is invalid.");
    }
    if (
      imageUrl.protocol !== "https:" ||
      imageUrl.hostname !== "res.cloudinary.com" ||
      !imageUrl.pathname.includes("/shopsphere/products/") ||
      typeof body.imagePublicId !== "string" ||
      !/^shopsphere\/products\/[A-Za-z0-9_-]+$/.test(body.imagePublicId)
    ) {
      throw new BadRequestException("The product image must be a ShopSphere Cloudinary asset.");
    }
  }

  async removeManagerProduct(request, id, response) {
    if (!(await this.managerPermissions(request)).includes("DELETE_PRODUCTS")) {
      throw new ForbiddenException("You do not have permission to delete products.");
    }
    const productId = typeof id === "object" && id !== null ? id.id : id;
    response.status(200).json({
      data: await this.products.removeManagerProduct(productId, request.user.id)
    });
  }

  async managerProductDetails(request, id, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("VIEW_PRODUCTS") && !permissions.includes("VIEW_PRODUCT_DETAILS")) {
      throw new ForbiddenException("You do not have permission to view product details.");
    }
    const productId = typeof id === "object" && id !== null ? id.id : id;
    const product = await this.products.getManagerProduct(productId, request.user.id);
    return response.status(200).json({ data: managerProductView(product, permissions) });
  }

  async managerPermissions(request) {
    return request.user.role === "MANAGER"
      ? LEGACY_MANAGER_PERMISSIONS
      : this.products.getInventoryManagerPermissions(request.user.id);
  }

  async adminImportPreview(request, response) {
    if (!request.file) {
      throw new BadRequestException("No file uploaded.");
    }

    const fileBuffer = request.file.buffer;
    const filename = request.file.originalname;
    const mimeType = request.file.mimetype;

    try {
      // Parse the file
      const parsedData = parseImportFile(fileBuffer, filename, mimeType);

      // Validate headers and rows
      const validationResult = validateImportRows(parsedData);

      // If headers are invalid, return early
      if (!validationResult.headerValidation.valid) {
        return response.status(400).json({
          success: false,
          filename: parsedData.filename,
          headerValidation: validationResult.headerValidation,
          rowResults: [],
          summary: null
        });
      }

      // Detect duplicates against database (no manager filter for Admin)
      const prisma = this.products.prisma;
      const afterDuplicateDetection = await detectDuplicates(
        validationResult.rowResults,
        prisma,
        null
      );

      // Generate summary
      const summary = generateDuplicateSummary(afterDuplicateDetection);

      response.status(200).json({
        success: true,
        filename: parsedData.filename,
        headerValidation: validationResult.headerValidation,
        rowResults: afterDuplicateDetection,
        summary
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to process file: ${error.message}`);
    }
  }

  async managerImportPreview(request, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("CREATE_PRODUCTS")) {
      throw new ForbiddenException("You do not have permission to import products.");
    }

    if (!request.file) {
      throw new BadRequestException("No file uploaded.");
    }

    const fileBuffer = request.file.buffer;
    const filename = request.file.originalname;
    const mimeType = request.file.mimetype;
    const managerId = request.user.id;

    try {
      // Parse the file
      const parsedData = parseImportFile(fileBuffer, filename, mimeType);

      // Validate headers and rows
      const validationResult = validateImportRows(parsedData);

      // If headers are invalid, return early
      if (!validationResult.headerValidation.valid) {
        return response.status(400).json({
          success: false,
          filename: parsedData.filename,
          headerValidation: validationResult.headerValidation,
          rowResults: [],
          summary: null
        });
      }

      // Detect duplicates against database (with manager filter)
      const prisma = this.products.prisma;
      const afterDuplicateDetection = await detectDuplicates(
        validationResult.rowResults,
        prisma,
        managerId
      );

      // Generate summary
      const summary = generateDuplicateSummary(afterDuplicateDetection);

      response.status(200).json({
        success: true,
        filename: parsedData.filename,
        headerValidation: validationResult.headerValidation,
        rowResults: afterDuplicateDetection,
        summary
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to process file: ${error.message}`);
    }
  }

  async adminImport(request, response) {
    if (!request.body || !Array.isArray(request.body.products)) {
      throw new BadRequestException("Import data must include a products array.");
    }

    const productsToImport = request.body.products;
    const results = {
      total: productsToImport.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    for (const productData of productsToImport) {
      const rowNumber = productData.rowNumber;
      
      // Remove rowNumber before validation as it's not a product field
      const { rowNumber: _, ...dataToValidate } = productData;
      
      try {
        // Validate the product data using the service's validation
        const validated = this.products.validateProductInput(dataToValidate);

        // Check if it's a duplicate (name + category)
        const existing = await this.products.prisma.product.findFirst({
          where: {
            name: validated.name,
            category: validated.category
          }
        });

        if (existing) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: `Product "${validated.name}" in category "${validated.category}" already exists (ID: ${existing.id})`
          });
          continue;
        }

        // Create the product
        await this.products.prisma.product.create({
          data: {
            ...validated,
            inStock: true,
            updatedAt: new Date()
          }
        });

        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: rowNumber,
          error: error.message || "Failed to import product"
        });
      }
    }

    response.status(200).json({
      success: true,
      results
    });
  }

  async managerImport(request, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("CREATE_PRODUCTS")) {
      throw new ForbiddenException("You do not have permission to import products.");
    }

    if (!request.body || !Array.isArray(request.body.products)) {
      throw new BadRequestException("Import data must include a products array.");
    }

    const productsToImport = request.body.products;
    const managerId = request.user.id;
    const results = {
      total: productsToImport.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    for (const productData of productsToImport) {
      const rowNumber = productData.rowNumber;
      
      // Remove rowNumber before validation as it's not a product field
      const { rowNumber: _, ...dataToValidate } = productData;
      
      try {
        // Validate the product data (manager can only set specific fields)
        const allowedFields = ["name", "category", "price", "description", "imageUrl", "imagePublicId"];
        const managerData = {};
        for (const field of allowedFields) {
          if (Object.hasOwn(dataToValidate, field)) {
            managerData[field] = dataToValidate[field];
          }
        }

        const validated = this.products.validateProductInput(managerData);

        // Check if it's a duplicate within manager's scope (name + category)
        const existing = await this.products.prisma.product.findFirst({
          where: {
            name: validated.name,
            category: validated.category,
            OR: [
              { managerId: Number(managerId) },
              { managerId: null }
            ]
          }
        });

        if (existing) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: `Product "${validated.name}" in category "${validated.category}" already exists (ID: ${existing.id})`
          });
          continue;
        }

        // Create the product with manager assignment
        await this.products.prisma.product.create({
          data: {
            ...validated,
            inStock: true,
            managerId: Number(managerId),
            updatedAt: new Date()
          }
        });

        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: rowNumber,
          error: error.message || "Failed to import product"
        });
      }
    }

    response.status(200).json({
      success: true,
      results
    });
  }

  async updateInventory(request, id, body, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("UPDATE_INVENTORY") || !permissions.includes("VIEW_STOCK_LEVELS")) {
      throw new ForbiddenException("You do not have permission to update inventory.");
    }
    response.status(200).json({
      data: managerProductView(await this.products.updateInventory(
        validateId(id),
        request.user.id,
        body,
        request.user.id
      ), permissions)
    });
  }

  async adjustManagerStock(request, id, body, response) {
    if (request.user.role !== "INVENTORY_MANAGER") {
      throw new ForbiddenException("Quantity adjustments are limited to Inventory Manager accounts.");
    }
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("UPDATE_INVENTORY") || !permissions.includes("VIEW_STOCK_LEVELS")) {
      throw new ForbiddenException("You do not have permission to update inventory.");
    }
    if (
      Object.hasOwn(body || {}, "lowStockThreshold") &&
      !permissions.includes("MANAGE_STOCK_ALERTS")
    ) {
      throw new ForbiddenException("You do not have permission to manage stock alert thresholds.");
    }
    response.status(200).json({
      data: managerProductView(await this.products.adjustStock(
        validateId(id),
        request.user.id,
        request.user.id,
        body
      ), permissions)
    });
  }

  async storeSettings(response) {
    const { getStoreSettings } = require("../admin/store-settings");
    const settings = getStoreSettings();
    response.status(200).json({
      data: {
        storeName: settings.storeName,
        storeEmail: settings.storeEmail,
        storePhone: settings.storePhone,
        storeAddress: settings.storeAddress,
        currency: settings.currency,
        allowCheckout: settings.allowCheckout,
        announcement: settings.announcement
      }
    });
  }
}

Inject(ProductService)(ProductController, undefined, 0);
Controller()(ProductController);

const AdminOnlyGuard = roleGuard("ADMIN");
const ManagerOnlyGuard = roleGuard("MANAGER");
Injectable()(AdminOnlyGuard);
Injectable()(ManagerOnlyGuard);

const prototype = ProductController.prototype;
function route(method, decorator, path, guards, parameters) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  decorator(path)(prototype, method, descriptor);
  if (guards.length) UseGuards(...guards)(prototype, method, descriptor);
  for (const [factory, index] of parameters) factory()(prototype, method, index);
}

route("list", Get, "products", [], [[Query, 0], [Res, 1]]);
route("storeSettings", Get, "store/settings", [], [[Res, 0]]);
route("get", Get, "products/:id", [], [[Param, 0], [Res, 1]]);
route("create", Post, "products", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Body, 0], [Res, 1]]);
route("update", Put, "products/:id", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Body, 1], [require("@nestjs/common").Req, 2], [Res, 3]]);
route("remove", Delete, "products/:id", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Res, 1]]);
route("adminList", Get, "admin/products", [SessionAuthGuard, AdminOnlyGuard], [[Query, 0], [Res, 1]]);
route("adminInventory", Get, "admin/inventory", [SessionAuthGuard, AdminOnlyGuard], [[Query, 0], [Res, 1]]);
route("adminInventorySummary", Get, "admin/inventory/summary", [SessionAuthGuard, AdminOnlyGuard], [[Res, 0]]);
route("updateAdminInventory", Patch, "admin/inventory/:id", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Body, 1], [require("@nestjs/common").Req, 2], [Res, 3]]);
route("updateAdminStock", Patch, "admin/inventory/:id/stock", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Body, 1], [require("@nestjs/common").Req, 2], [Res, 3]]);
route("users", Get, "admin/users", [SessionAuthGuard, AdminOnlyGuard], [[Res, 0]]);
route("updateRole", Patch, "admin/users/:id/role", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Body, 1], [Req, 2], [Res, 3]]);
route("resetUserPassword", Patch, "admin/users/:id/password", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Body, 1], [Res, 2]]);
route("updateInventoryManagerPermission", Patch, "admin/users/:id/inventory-permissions/:permission", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Param, 1], [Body, 2], [Res, 3]]);
route("replaceInventoryManagerPermissions", Patch, "admin/users/:id/inventory-permissions", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Body, 1], [Res, 2]]);
route("customerPermissions", Get, "admin/customer-permissions", [SessionAuthGuard, AdminOnlyGuard], [[Res, 0]]);
route("replaceCustomerPermissions", Patch, "admin/customer-permissions", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Body, 0], [Res, 1]]);
route("assignManager", Patch, "admin/products/:id/manager", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[Param, 0], [Body, 1], [Res, 2]]);
route("adminImportPreview", Post, "admin/products/import/preview", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Res, 1]]);
route("adminImport", Post, "admin/products/import", [SessionAuthGuard, AdminOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Res, 1]]);
route("managerProducts", Get, "manager/products", [SessionAuthGuard, ManagerOnlyGuard], [[require("@nestjs/common").Req, 0], [Query, 1], [Res, 2]]);
route("managerProductDetails", Get, "manager/products/:id", [SessionAuthGuard, ManagerOnlyGuard], [[require("@nestjs/common").Req, 0], [Param, 1], [Res, 2]]);
route("managerAccess", Get, "manager/access", [SessionAuthGuard, ManagerOnlyGuard], [[require("@nestjs/common").Req, 0], [Res, 1]]);
route("managerDashboard", Get, "manager/dashboard", [SessionAuthGuard, ManagerOnlyGuard], [[require("@nestjs/common").Req, 0], [Res, 1]]);
route("managerInventoryAlerts", Get, "manager/inventory/alerts", [SessionAuthGuard, ManagerOnlyGuard], [[require("@nestjs/common").Req, 0], [Query, 1], [Res, 2]]);
route("managerStockHistory", Get, "manager/inventory/history", [SessionAuthGuard, ManagerOnlyGuard], [[require("@nestjs/common").Req, 0], [Query, 1], [Res, 2]]);
route("managerInventoryReport", Get, "manager/inventory/reports", [SessionAuthGuard, ManagerOnlyGuard], [[require("@nestjs/common").Req, 0], [Query, 1], [Res, 2]]);
route("exportManagerInventoryReport", Get, "manager/inventory/reports/export", [SessionAuthGuard, ManagerOnlyGuard], [[require("@nestjs/common").Req, 0], [Query, 1], [Res, 2]]);
route("managerImportPreview", Post, "manager/products/import/preview", [SessionAuthGuard, ManagerOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Res, 1]]);
route("managerImport", Post, "manager/products/import", [SessionAuthGuard, ManagerOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Res, 1]]);
route("createManagerProduct", Post, "manager/products", [SessionAuthGuard, ManagerOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Body, 1], [Res, 2]]);
route("editManagerProduct", Put, "manager/products/:id", [SessionAuthGuard, ManagerOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Param, 1], [Body, 2], [Res, 3]]);
route("removeManagerProduct", Delete, "manager/products/:id", [SessionAuthGuard, ManagerOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Param, 1], [Res, 2]]);
route("updateInventory", Patch, "manager/products/:id/inventory", [SessionAuthGuard, ManagerOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Param, 1], [Body, 2], [Res, 3]]);
route("adjustManagerStock", Patch, "manager/products/:id/stock", [SessionAuthGuard, ManagerOnlyGuard, CsrfGuard], [[require("@nestjs/common").Req, 0], [Param, 1], [Body, 2], [Res, 3]]);

module.exports = {
  AdminOnlyGuard,
  ManagerOnlyGuard,
  ProductController,
  managerProductView,
  validateId
};
