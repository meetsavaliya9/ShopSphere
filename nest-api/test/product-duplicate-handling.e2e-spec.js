const { BadRequestException, ForbiddenException } = require("@nestjs/common");
const { parseImportFile } = require("../src/utils/file-parser");
const { validateImportRows } = require("../src/products/product-import-validator");
const {
  detectDuplicates,
  generateComparisonKey,
  generateSlugComparisonKey,
  toProductSlug,
  normalizeSku,
  normalizeForComparison
} = require("../src/products/product-duplicate-detector");
const { ProductService, validateProductInput } = require("../src/products/product.service");
const { ProductController } = require("../src/products/product.controller");

function createMockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    }
  };
  return res;
}

describe("Product duplicate handling and import isolation", () => {
  let createdProducts;
  let databaseProducts;
  let mockPrisma;
  let productService;
  let controller;

  beforeEach(() => {
    createdProducts = [];
    databaseProducts = [
      {
        id: 101,
        name: "Existing Database Product",
        category: "Electronics",
        price: 99.99,
        stockQuantity: 50,
        inStock: true,
        managerId: null
      },
      {
        id: 102,
        name: "Legacy Gadget",
        category: "Accessories",
        price: 19.99,
        stockQuantity: 10,
        inStock: true,
        managerId: 42
      }
    ];

    mockPrisma = {
      product: {
        async findMany({ where }) {
          // If OR condition provided, filter databaseProducts
          if (where?.OR && Array.isArray(where.OR)) {
            return databaseProducts.filter((p) => {
              return where.OR.some((cond) => {
                if (cond.name && p.name.toLowerCase() === cond.name.toLowerCase()) return true;
                if (cond.category && p.category.toLowerCase() === cond.category.toLowerCase()) return true;
                return false;
              });
            });
          }
          return [...databaseProducts];
        },
        async findFirst({ where }) {
          if (!where) return null;
          return databaseProducts.find((p) => {
            if (where.name && where.category) {
              const nameMatch = p.name.trim().toLowerCase() === where.name.trim().toLowerCase();
              const catMatch = p.category.trim().toLowerCase() === where.category.trim().toLowerCase();
              return nameMatch && catMatch;
            }
            if (where.name) return p.name.trim().toLowerCase() === where.name.trim().toLowerCase();
            return false;
          }) || null;
        },
        async create({ data }) {
          const newId = databaseProducts.length + 100;
          const record = { id: newId, ...data };
          databaseProducts.push(record);
          createdProducts.push(record);
          return record;
        },
        async update({ where, data }) {
          const idx = databaseProducts.findIndex((p) => p.id === where.id);
          if (idx !== -1) {
            databaseProducts[idx] = { ...databaseProducts[idx], ...data };
            return databaseProducts[idx];
          }
          throw new Error("Product not found");
        }
      }
    };

    productService = new ProductService({});
    productService.prisma = mockPrisma;
    controller = new ProductController(productService);
  });

  // 1. A file containing only new products
  test("1. Imports all products when file contains only new valid products", async () => {
    const csvContent = [
      "Product Name,Category,Price,SKU,Stock Quantity",
      "Brand New Laptop,Electronics,899.99,SKU-LAP-101,15",
      "Wireless Earbuds,Electronics,49.99,SKU-EAR-102,50",
      "Ergonomic Chair,Furniture,199.99,SKU-CHR-103,10"
    ].join("\n");

    const buffer = Buffer.from(csvContent);
    const request = {
      file: {
        buffer,
        originalname: "new-products.csv",
        mimetype: "text/csv"
      }
    };
    const response = createMockResponse();

    await controller.adminImport(request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe("success");
    expect(response.body.results.total).toBe(3);
    expect(response.body.results.successful).toBe(3);
    expect(response.body.results.skipped).toBe(0);
    expect(response.body.results.failed).toBe(0);
    expect(response.body.results.errors).toHaveLength(0);
    expect(createdProducts).toHaveLength(3);
    expect(createdProducts[0].name).toBe("Brand New Laptop");
    expect(createdProducts[1].name).toBe("Wireless Earbuds");
    expect(createdProducts[2].name).toBe("Ergonomic Chair");
  });

  // 2. A file containing existing database duplicates and new products
  test("2. Skips database duplicates and imports new products without updating existing records", async () => {
    const initialExistingStock = databaseProducts[0].stockQuantity;
    const initialExistingPrice = databaseProducts[0].price;

    const request = {
      body: {
        products: [
          // Row 1: Existing in database with altered price/stock (must NOT overwrite)
          { rowNumber: 1, name: "Existing Database Product", category: "Electronics", price: 9.99, stockQuantity: 999 },
          // Row 2: Completely new product
          { rowNumber: 2, name: "Mechanical Numpad", category: "Electronics", price: 29.99, stockQuantity: 25 },
          // Row 3: Another existing product
          { rowNumber: 3, name: "Legacy Gadget", category: "Accessories", price: 5.00 }
        ]
      }
    };
    const response = createMockResponse();

    await controller.adminImport(request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("partial_success");
    expect(response.body.results.total).toBe(3);
    expect(response.body.results.successful).toBe(1);
    expect(response.body.results.skipped).toBe(2);
    expect(response.body.results.failed).toBe(0);

    // Verify only the 1 new product was created
    expect(createdProducts).toHaveLength(1);
    expect(createdProducts[0].name).toBe("Mechanical Numpad");

    // CRITICAL: Ensure existing database products were NEVER overwritten or modified
    const dbItem1 = databaseProducts.find((p) => p.id === 101);
    expect(dbItem1.stockQuantity).toBe(initialExistingStock);
    expect(dbItem1.price).toBe(initialExistingPrice);

    // Verify detailed skip reports
    const skipErrors = response.body.results.errors.filter((e) => e.type === "duplicate");
    expect(skipErrors).toHaveLength(2);
    expect(skipErrors[0].row).toBe(1);
    expect(skipErrors[0].error).toContain("already exists");
    expect(skipErrors[1].row).toBe(3);
  });

  // 3. Duplicate SKUs and names/slugs within one file
  test("3. Handles in-file duplicates by name/slug and SKU: imports 1st occurrence and skips 2nd+", async () => {
    const request = {
      body: {
        products: [
          // Row 1: Valid new product
          { rowNumber: 1, name: "Studio Microphone", category: "Audio", price: 120.00, sku: "MIC-001" },
          // Row 2: In-file duplicate by exact name & category
          { rowNumber: 2, name: "Studio Microphone", category: "Audio", price: 120.00, sku: "MIC-DIFF" },
          // Row 3: In-file duplicate by canonical slug ("Studio-Microphone" -> "studio-microphone")
          { rowNumber: 3, name: "Studio-Microphone", category: "Audio", price: 130.00, sku: "MIC-DIFF2" },
          // Row 4: Valid distinct product
          { rowNumber: 4, name: "Microphone Stand", category: "Audio", price: 35.00, sku: "STAND-001" },
          // Row 5: In-file duplicate by SKU ("STAND-001" reused)
          { rowNumber: 5, name: "Boom Arm Accessory", category: "Audio", price: 40.00, sku: "STAND-001" }
        ]
      }
    };
    const response = createMockResponse();

    await controller.adminImport(request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("partial_success");
    expect(response.body.results.total).toBe(5);
    expect(response.body.results.successful).toBe(2); // Rows 1 and 4
    expect(response.body.results.skipped).toBe(3); // Rows 2, 3, 5
    expect(response.body.results.failed).toBe(0);

    expect(createdProducts).toHaveLength(2);
    expect(createdProducts[0].name).toBe("Studio Microphone");
    expect(createdProducts[1].name).toBe("Microphone Stand");

    // Check skip reasons
    const errors = response.body.results.errors;
    const row2Error = errors.find((e) => e.row === 2);
    expect(row2Error.error).toContain("Duplicate of row 1");

    const row3Error = errors.find((e) => e.row === 3);
    expect(row3Error.error).toContain("Duplicate of row 1");

    const row5Error = errors.find((e) => e.row === 5);
    expect(row5Error.field).toBe("sku");
    expect(row5Error.error).toContain("same SKU");
  });

  // 4. Case and whitespace variations
  test("4. Normalizes whitespace and casing differences to detect duplicates consistently", async () => {
    const request = {
      body: {
        products: [
          // Matches database product "Existing Database Product" with leading/trailing whitespace & uppercase
          { rowNumber: 1, name: "   EXISTING DATABASE PRODUCT   ", category: "  electronics  ", price: 80.00 },
          // First in-file occurrence
          { rowNumber: 2, name: "Bluetooth Speaker", category: "Audio", price: 45.00, sku: "  SPK-BLUE  " },
          // Second in-file occurrence with casing and whitespace difference
          { rowNumber: 3, name: "  bluetooth speaker  ", category: "AUDIO", price: 45.00, sku: "spk-blue" }
        ]
      }
    };
    const response = createMockResponse();

    await controller.adminImport(request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.results.total).toBe(3);
    expect(response.body.results.successful).toBe(1); // Row 2
    expect(response.body.results.skipped).toBe(2); // Rows 1 and 3

    expect(createdProducts).toHaveLength(1);
    expect(createdProducts[0].name).toBe("Bluetooth Speaker");
  });

  // 5. Expected example: 10 rows (3 duplicates, 1 invalid row, 6 valid new products)
  test("5. Expected Example: 10 rows with 3 duplicates, 1 invalid row, and 6 valid new products", async () => {
    const request = {
      body: {
        products: [
          // Row 1: Valid new product 1
          { rowNumber: 1, name: "Ultra Gaming Mouse", category: "Gaming", price: 59.99, sku: "GM-01" },
          // Row 2: Duplicate 1 -> Database duplicate ("Existing Database Product")
          { rowNumber: 2, name: "Existing Database Product", category: "Electronics", price: 100.00 },
          // Row 3: Valid new product 2
          { rowNumber: 3, name: "Mechanical Keyboard RGB", category: "Gaming", price: 119.99, sku: "KB-01" },
          // Row 4: Duplicate 2 -> In-file duplicate of row 1 (same name)
          { rowNumber: 4, name: "Ultra Gaming Mouse", category: "Gaming", price: 59.99 },
          // Row 5: Valid new product 3
          { rowNumber: 5, name: "Desk Pad XXL", category: "Accessories", price: 24.99, sku: "DP-01" },
          // Row 6: Invalid row -> negative price
          { rowNumber: 6, name: "Corrupted Item", category: "Gaming", price: -15.00 },
          // Row 7: Valid new product 4
          { rowNumber: 7, name: "Monitor Arm Dual", category: "Furniture", price: 79.99, sku: "MA-01" },
          // Row 8: Duplicate 3 -> In-file duplicate of row 7 SKU ("MA-01")
          { rowNumber: 8, name: "Single Monitor Arm", category: "Furniture", price: 49.99, sku: "MA-01" },
          // Row 9: Valid new product 5
          { rowNumber: 9, name: "Webcam 4K Pro", category: "Electronics", price: 149.99, sku: "CAM-01" },
          // Row 10: Valid new product 6
          { rowNumber: 10, name: "USB-C Docking Station", category: "Electronics", price: 89.99, sku: "DOC-01" }
        ]
      }
    };
    const response = createMockResponse();

    await controller.adminImport(request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe("partial_success");

    const results = response.body.results;
    expect(results.total).toBe(10);
    expect(results.successful).toBe(6);
    expect(results.skipped).toBe(3);
    expect(results.failed).toBe(1);

    // Sum verification: 6 + 3 + 1 = 10
    expect(results.successful + results.skipped + results.failed).toBe(results.total);

    // Valid products were correctly inserted
    expect(createdProducts).toHaveLength(6);
    expect(createdProducts.map((p) => p.name)).toEqual([
      "Ultra Gaming Mouse",
      "Mechanical Keyboard RGB",
      "Desk Pad XXL",
      "Monitor Arm Dual",
      "Webcam 4K Pro",
      "USB-C Docking Station"
    ]);

    // Breakdown of errors
    expect(results.errors).toHaveLength(4); // 3 skipped duplicates + 1 invalid row
    const invalidRow = results.errors.find((e) => e.row === 6);
    expect(invalidRow).toBeDefined();
    expect(invalidRow.type).toBe("validation");
    expect(invalidRow.field).toBe("price");

    const dupRows = results.errors.filter((e) => e.type === "duplicate");
    expect(dupRows).toHaveLength(3);
    expect(dupRows.map((e) => e.row).sort()).toEqual([2, 4, 8]);
  });

  // 6. Database unique-constraint conflicts (race condition safety)
  test("6. Safely handles Prisma P2002 / MySQL unique-constraint race conditions as skipped duplicates", async () => {
    // Mock prisma.product.create to throw P2002 on a specific row to simulate race condition
    const originalCreate = mockPrisma.product.create;
    mockPrisma.product.create = jest.fn(async ({ data }) => {
      if (data.name === "Race Condition Product") {
        const error = new Error("Unique constraint failed on the constraint: `Product_name_key`");
        error.code = "P2002";
        throw error;
      }
      return originalCreate({ data });
    });

    const request = {
      body: {
        products: [
          { rowNumber: 1, name: "Safe Product Before", category: "General", price: 10.00 },
          { rowNumber: 2, name: "Race Condition Product", category: "General", price: 20.00 },
          { rowNumber: 3, name: "Safe Product After", category: "General", price: 30.00 }
        ]
      }
    };
    const response = createMockResponse();

    await controller.adminImport(request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("partial_success");
    expect(response.body.results.total).toBe(3);
    expect(response.body.results.successful).toBe(2);
    expect(response.body.results.skipped).toBe(1);
    expect(response.body.results.failed).toBe(0);

    const conflictErr = response.body.results.errors.find((e) => e.row === 2);
    expect(conflictErr).toBeDefined();
    expect(conflictErr.type).toBe("duplicate");
    expect(conflictErr.error).toContain("unique constraint conflict");
  });

  // 7. Both Admin and Inventory Manager imports
  test("7. Enforces identical duplicate handling for both Admin and Inventory Manager imports", async () => {
    // Inventory Manager import
    controller.managerPermissions = async () => ["CREATE_PRODUCTS"];

    const managerRequest = {
      user: { id: 77, role: "INVENTORY_MANAGER" },
      body: {
        products: [
          // Row 1: Existing database product -> must be skipped
          { rowNumber: 1, name: "Existing Database Product", category: "Electronics", price: 99.99 },
          // Row 2: Valid new product -> must be imported with managerId: 77
          { rowNumber: 2, name: "Manager Specific Item", category: "Tools", price: 45.00 },
          // Row 3: Duplicate within file -> must be skipped
          { rowNumber: 3, name: "Manager Specific Item", category: "Tools", price: 45.00 }
        ]
      }
    };
    const managerResponse = createMockResponse();

    await controller.managerImport(managerRequest, managerResponse);

    expect(managerResponse.statusCode).toBe(200);
    expect(managerResponse.body.results.total).toBe(3);
    expect(managerResponse.body.results.successful).toBe(1);
    expect(managerResponse.body.results.skipped).toBe(2);
    expect(managerResponse.body.results.failed).toBe(0);

    const createdManagerProduct = createdProducts.find((p) => p.name === "Manager Specific Item");
    expect(createdManagerProduct).toBeDefined();
    expect(createdManagerProduct.managerId).toBe(77);

    // Permission guard check: Manager without CREATE_PRODUCTS is forbidden
    controller.managerPermissions = async () => ["VIEW_PRODUCTS"];
    await expect(
      controller.managerImport(
        { user: { id: 77, role: "INVENTORY_MANAGER" }, body: { products: [] } },
        createMockResponse()
      )
    ).rejects.toThrow(ForbiddenException);
  });
});
