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
const {
  detectDuplicates,
  generateDuplicateSummary,
  generateComparisonKey,
  generateSlugComparisonKey,
  toProductSlug,
  normalizeSku,
  normalizeForComparison
} = require("../products/product-duplicate-detector");
const { parseImportFile } = require("../utils/file-parser");
const { validateImportRows } = require("./product-import-validator");

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
const { ProductService, validateProductInput } = require("./product.service");

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

async function executeProductImport({
  productsToImport,
  prisma,
  managerId = null,
  validateProductInputFn = validateProductInput
}) {
  const results = {
    total: productsToImport.length,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  if (!productsToImport || productsToImport.length === 0) {
    return {
      success: true,
      status: "success",
      results
    };
  }

  // Pre-fetch candidate products from the database for fast and safe duplicate detection
  const uniqueNames = new Set();
  const uniqueCategories = new Set();
  for (const item of productsToImport) {
    const name = item?.name || item?.rawData?.name;
    const cat = item?.category || item?.rawData?.category;
    if (typeof name === "string" && name.trim()) {
      uniqueNames.add(name);
      uniqueNames.add(name.trim());
    }
    if (typeof cat === "string" && cat.trim()) {
      uniqueCategories.add(cat);
      uniqueCategories.add(cat.trim());
    }
  }

  const existingProductMap = new Map();
  const existingProductSlugMap = new Map();

  if ((uniqueNames.size > 0 || uniqueCategories.size > 0) && typeof prisma?.product?.findMany === "function") {
    const whereConditions = [];
    if (uniqueNames.size > 0) {
      whereConditions.push(...Array.from(uniqueNames).map((name) => ({ name })));
    }
    if (uniqueCategories.size > 0) {
      whereConditions.push(...Array.from(uniqueCategories).map((category) => ({ category })));
    }

    try {
      const dbProducts = await prisma.product.findMany({
        where: {
          OR: whereConditions
        },
        select: {
          id: true,
          name: true,
          category: true,
          managerId: true
        }
      });

      for (const prod of dbProducts) {
        const compKey = generateComparisonKey(prod.name, prod.category);
        existingProductMap.set(compKey, prod);
        const slugKey = generateSlugComparisonKey(prod.name, prod.category);
        if (slugKey) {
          existingProductSlugMap.set(slugKey, prod);
        }
      }
    } catch {
      // In case findMany is not supported in a mock, fallback gracefully
    }
  }

  // In-batch duplicate tracking sets/maps
  const seenKeysInBatch = new Map();
  const seenSlugKeysInBatch = new Map();
  const seenSkusInBatch = new Map();

  for (let i = 0; i < productsToImport.length; i++) {
    const productData = productsToImport[i];
    const rowNumber = productData?.rowNumber !== undefined ? productData.rowNumber : i + 1;
    const rawSku = productData?.sku !== undefined && productData?.sku !== null && productData?.sku !== ""
      ? productData.sku
      : null;
    const productSku = rawSku !== null ? String(rawSku).trim() : null;
    const identifier = productSku || productData?.name || `Row ${rowNumber}`;

    try {
      if (!productData || typeof productData !== "object" || Array.isArray(productData)) {
        throw new BadRequestException("Invalid product row data.");
      }

      // Check if this row had pre-existing validation errors (e.g. from file parser)
      if (Array.isArray(productData._validationErrors) && productData._validationErrors.length > 0) {
        const errorMsg = productData._validationErrors.join("; ");
        results.failed++;
        results.errors.push({
          row: rowNumber,
          sku: productSku,
          identifier,
          field: "row",
          error: errorMsg,
          type: "validation"
        });
        continue;
      }

      // Validate SKU if provided
      if (rawSku !== null) {
        if (typeof rawSku !== "string" && typeof rawSku !== "number") {
          throw new BadRequestException("SKU must be text.");
        }
        if (productSku.length > 100) {
          throw new BadRequestException("SKU exceeds maximum length of 100 characters.");
        }
      }

      // Validate stock quantity if provided
      let parsedStock = null;
      if (productData.stockQuantity !== undefined && productData.stockQuantity !== null && productData.stockQuantity !== "") {
        parsedStock = Number(productData.stockQuantity);
        if (!Number.isFinite(parsedStock) || !Number.isSafeInteger(parsedStock) || parsedStock < 0 || parsedStock > 2147483647) {
          throw new BadRequestException("Stock quantity must be a non-negative whole number.");
        }
      }

      // Validate low stock threshold if provided
      let parsedThreshold = null;
      if (productData.lowStockThreshold !== undefined && productData.lowStockThreshold !== null && productData.lowStockThreshold !== "") {
        parsedThreshold = Number(productData.lowStockThreshold);
        if (!Number.isFinite(parsedThreshold) || !Number.isSafeInteger(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 2147483647) {
          throw new BadRequestException("Low stock threshold must be a non-negative whole number.");
        }
      }

      // Extract core fields supported by product service
      const allowedCoreFields = managerId !== null
        ? ["name", "category", "price", "description", "imageUrl", "imagePublicId"]
        : ["name", "category", "price", "description", "imageUrl", "imagePublicId", "inStock", "managerId"];

      const coreData = {};
      for (const field of allowedCoreFields) {
        if (Object.hasOwn(productData, field)) {
          coreData[field] = productData[field];
        }
      }

      // Validate the product data using ProductService validation
      const validated = typeof validateProductInputFn === "function"
        ? validateProductInputFn(coreData)
        : validateProductInput(coreData);

      // Normalization comparison keys
      const compKey = generateComparisonKey(validated.name, validated.category);
      const slugKey = generateSlugComparisonKey(validated.name, validated.category);
      const skuKey = normalizeSku(productSku);

      // 1. In-file duplicate check: Exact normalized name + category
      if (seenKeysInBatch.has(compKey)) {
        const firstOccur = seenKeysInBatch.get(compKey);
        results.skipped++;
        results.errors.push({
          row: rowNumber,
          sku: productSku,
          identifier,
          field: "name",
          error: `Duplicate of row ${firstOccur.rowNumber} (same name and category: "${validated.name}")`,
          type: "duplicate"
        });
        continue;
      }

      // 2. In-file duplicate check: Canonical slug + category
      if (slugKey && seenSlugKeysInBatch.has(slugKey)) {
        const firstOccur = seenSlugKeysInBatch.get(slugKey);
        results.skipped++;
        results.errors.push({
          row: rowNumber,
          sku: productSku,
          identifier,
          field: "name",
          error: `Duplicate of row ${firstOccur.rowNumber} (same product slug/name: "${validated.name}")`,
          type: "duplicate"
        });
        continue;
      }

      // 3. In-file duplicate check: Duplicate SKU within uploaded file
      if (skuKey && seenSkusInBatch.has(skuKey)) {
        const firstOccur = seenSkusInBatch.get(skuKey);
        results.skipped++;
        results.errors.push({
          row: rowNumber,
          sku: productSku,
          identifier,
          field: "sku",
          error: `Duplicate of row ${firstOccur.rowNumber} (same SKU: "${productSku}")`,
          type: "duplicate"
        });
        continue;
      }

      // 4. Database duplicate check: Match from pre-fetched candidates (name, slug, case, whitespace)
      let existingInDb = existingProductMap.get(compKey) || (slugKey ? existingProductSlugMap.get(slugKey) : null);

      // Fallback direct DB check if not found in prefetch
      if (!existingInDb && typeof prisma?.product?.findFirst === "function") {
        existingInDb = await prisma.product.findFirst({
          where: {
            name: validated.name,
            category: validated.category
          },
          select: { id: true, name: true, category: true }
        });
      }

      if (existingInDb) {
        results.skipped++;
        results.errors.push({
          row: rowNumber,
          sku: productSku,
          identifier,
          field: "name",
          error: `Product "${validated.name}" in category "${validated.category}" already exists (ID: ${existingInDb.id})`,
          type: "duplicate"
        });
        continue;
      }

      // 5. Create product in database
      const createData = {
        ...validated,
        ...(managerId !== null ? { managerId: Number(managerId) } : {}),
        ...(parsedStock !== null ? { stockQuantity: parsedStock } : {}),
        ...(parsedThreshold !== null ? { lowStockThreshold: parsedThreshold } : {}),
        inStock: parsedStock !== null ? parsedStock > 0 : (managerId !== null ? true : (validated.inStock ?? true)),
        updatedAt: new Date()
      };

      try {
        const created = await prisma.product.create({
          data: createData
        });

        // Register in seen maps for subsequent in-batch rows
        seenKeysInBatch.set(compKey, { rowNumber, name: validated.name, category: validated.category, sku: productSku });
        if (slugKey) seenSlugKeysInBatch.set(slugKey, { rowNumber, name: validated.name, category: validated.category, sku: productSku });
        if (skuKey) seenSkusInBatch.set(skuKey, { rowNumber, name: validated.name, category: validated.category, sku: productSku });

        existingProductMap.set(compKey, created);
        if (slugKey) existingProductSlugMap.set(slugKey, created);

        results.successful++;
      } catch (dbError) {
        if (
          dbError?.code === "P2002" ||
          dbError?.message?.includes("Unique constraint") ||
          dbError?.message?.includes("Duplicate entry") ||
          dbError?.message?.includes("duplicate key")
        ) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            sku: productSku,
            identifier,
            field: "name",
            error: `Product "${validated.name}" in category "${validated.category}" already exists (unique constraint conflict)`,
            type: "duplicate"
          });
        } else {
          throw dbError;
        }
      }
    } catch (error) {
      results.failed++;
      let fieldName = "row";
      const msg = error.message || "Failed to import product";
      if (/image/i.test(msg)) fieldName = "imageUrl";
      else if (/\bname\b/i.test(msg)) fieldName = "name";
      else if (/price/i.test(msg)) fieldName = "price";
      else if (/category/i.test(msg)) fieldName = "category";
      else if (/stock/i.test(msg)) fieldName = "stockQuantity";
      else if (/threshold/i.test(msg)) fieldName = "lowStockThreshold";
      else if (/sku/i.test(msg)) fieldName = "sku";

      results.errors.push({
        row: rowNumber,
        sku: productSku,
        identifier,
        field: fieldName,
        error: msg,
        type: "validation"
      });
    }
  }

  let status = "success";
  if (results.total > 0) {
    if (results.successful === 0) {
      status = "failure";
    } else if (results.skipped > 0 || results.failed > 0) {
      status = "partial_success";
    } else {
      status = "success";
    }
  }

  return {
    success: results.successful > 0 || results.total === 0,
    status,
    results
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
    let productsToImport = [];

    if (request.file) {
      const fileBuffer = request.file.buffer;
      const filename = request.file.originalname;
      const mimeType = request.file.mimetype;
      const parsedData = parseImportFile(fileBuffer, filename, mimeType);
      const validationResult = validateImportRows(parsedData);
      if (!validationResult.headerValidation.valid) {
        throw new BadRequestException(
          `Missing required headers: ${validationResult.headerValidation.missingRequired.join(", ")}`
        );
      }
      productsToImport = validationResult.rowResults.map((r) => {
        if (r.status === "invalid") {
          return {
            rowNumber: r.rowNumber,
            _validationErrors: r.errors,
            ...(r.data || r.rawData || {})
          };
        }
        return {
          rowNumber: r.rowNumber,
          ...r.data
        };
      });
    } else if (request.body && Array.isArray(request.body.products)) {
      productsToImport = request.body.products;
    } else {
      throw new BadRequestException("Import data must include a products array or uploaded file.");
    }

    const validateFn = typeof this.products?.validateProductInput === "function"
      ? this.products.validateProductInput.bind(this.products)
      : validateProductInput;

    const importResult = await executeProductImport({
      productsToImport,
      prisma: this.products.prisma,
      managerId: null,
      validateProductInputFn: validateFn
    });

    response.status(200).json(importResult);
  }

  async importTemplate(query, response) {
    const format = (query?.format || "csv").toLowerCase();
    const headers = [
      "Product Name",
      "Category",
      "Price",
      "Description",
      "Image URL",
      "Stock Quantity",
      "Low Stock Threshold"
    ];
    const sampleRows = [
      ["Wireless Noise-Canceling Headphones", "Electronics", 12999.00, "Premium over-ear headphones with active noise cancellation and 30-hour battery life.", "https://images.unsplash.com/photo-1505740420928-5e560c06d30e", 45, 10],
      ["Organic Cotton Classic Tee", "Apparel", 999.00, "Breathable 100% organic cotton t-shirt with reinforced stitching.", "https://images.unsplash.com/photo-1521572267360-ee0c2909d518", 120, 25],
      ["Stainless Steel Water Bottle", "Fitness", 749.50, "Double-walled vacuum insulated 750ml flask keeping drinks cold for 24 hours.", "https://images.unsplash.com/photo-1602143407151-7111542de6e8", 80, 15],
      ["Ceramic Pour-Over Coffee Dripper", "Kitchen", 1499.00, "Handcrafted ceramic dripper for artisanal pour-over brewing.", "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd", 30, 5],
      ["Minimalist Desk Organizer", "Office", 899.00, "Compact bamboo desk organizer with phone stand and cable management.", "", 50, 10]
    ];

    if (format === "xlsx" || format === "xls") {
      const xlsx = require("xlsx");
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet([headers, ...sampleRows]);
      xlsx.utils.book_append_sheet(wb, ws, "Products");
      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      response.setHeader("Content-Disposition", 'attachment; filename="shopsphere-product-template.xlsx"');
      return response.status(200).send(buffer);
    }

    const csv = "\uFEFF" + [
      headers.join(","),
      ...sampleRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", 'attachment; filename="shopsphere-product-template.csv"');
    return response.status(200).send(csv);
  }

  async managerImportTemplate(query, response) {
    return this.importTemplate(query, response);
  }

  async managerImport(request, response) {
    const permissions = await this.managerPermissions(request);
    if (!permissions.includes("CREATE_PRODUCTS")) {
      throw new ForbiddenException("You do not have permission to import products.");
    }

    let productsToImport = [];

    if (request.file) {
      const fileBuffer = request.file.buffer;
      const filename = request.file.originalname;
      const mimeType = request.file.mimetype;
      const parsedData = parseImportFile(fileBuffer, filename, mimeType);
      const validationResult = validateImportRows(parsedData);
      if (!validationResult.headerValidation.valid) {
        throw new BadRequestException(
          `Missing required headers: ${validationResult.headerValidation.missingRequired.join(", ")}`
        );
      }
      productsToImport = validationResult.rowResults.map((r) => {
        if (r.status === "invalid") {
          return {
            rowNumber: r.rowNumber,
            _validationErrors: r.errors,
            ...(r.data || r.rawData || {})
          };
        }
        return {
          rowNumber: r.rowNumber,
          ...r.data
        };
      });
    } else if (request.body && Array.isArray(request.body.products)) {
      productsToImport = request.body.products;
    } else {
      throw new BadRequestException("Import data must include a products array or uploaded file.");
    }

    const managerId = request.user.id;
    const validateFn = typeof this.products?.validateProductInput === "function"
      ? this.products.validateProductInput.bind(this.products)
      : validateProductInput;

    const importResult = await executeProductImport({
      productsToImport,
      prisma: this.products.prisma,
      managerId,
      validateProductInputFn: validateFn
    });

    response.status(200).json(importResult);
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
route("importTemplate", Get, "admin/products/import/template", [SessionAuthGuard, AdminOnlyGuard], [[Query, 0], [Res, 1]]);
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
route("managerImportTemplate", Get, "manager/products/import/template", [SessionAuthGuard, ManagerOnlyGuard], [[Query, 0], [Res, 1]]);
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
