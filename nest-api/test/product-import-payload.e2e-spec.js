const { Test } = require("@nestjs/testing");
const { createHash } = require("node:crypto");
const request = require("supertest");
const xlsx = require("xlsx");
const { AUTH_SERVICE_OPTIONS } = require("../src/auth/auth.service");
const { installAuthRequestParsing } = require("../src/auth/auth-request-parsing");
const { AppModule } = require("../src/app.module");
const { AllExceptionsFilter } = require("../src/common/filters/all-exceptions.filter");
const { PrismaService } = require("../src/prisma/prisma.service");
const { createFakeAuthPrisma } = require("./helpers/fake-auth-prisma");

describe("Product Import Payload & File Upload E2E", () => {
  let app;
  let prisma;
  let adminCookie;
  let managerCookie;
  let customerCookie;
  let csrfToken;
  let csrfCookie;
  let createdProducts = [];

  beforeAll(async () => {
    process.env.CSRF_SECRET = "import-payload-test-csrf-secret-at-least-32-chars";
    process.env.NODE_ENV = "test";
    prisma = createFakeAuthPrisma();

    // Enhance mock prisma with product.findFirst, product.create, inventorymanagerpermission
    createdProducts = [];
    const existingProducts = [
      { id: 99, name: "Existing Keyboard", category: "Electronics", price: "2999.00", inStock: true, managerId: null }
    ];

    prisma.client.product.findFirst = async ({ where }) => {
      const match = existingProducts.concat(createdProducts).find((p) => {
        const matchName = p.name === where.name;
        const matchCat = p.category === where.category;
        return matchName && matchCat;
      });
      return match || null;
    };

    prisma.client.product.findMany = async ({ where } = {}) => {
      return existingProducts.concat(createdProducts);
    };

    prisma.client.product.create = async ({ data }) => {
      const product = { id: 100 + createdProducts.length, ...data };
      createdProducts.push(product);
      return product;
    };

    prisma.client.inventorymanagerpermission = {
      async findMany({ where }) {
        // Manager ID 2 has CREATE_PRODUCTS permission
        if (where?.userId === 2) {
          return [{ permission: "CREATE_PRODUCTS" }, { permission: "VIEW_INVENTORY" }];
        }
        return [];
      }
    };

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue({ client: prisma.client })
      .overrideProvider(AUTH_SERVICE_OPTIONS)
      .useValue({
        otpSecret: process.env.CSRF_SECRET,
        emailSender: { isConfigured: () => false }
      })
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new AllExceptionsFilter());
    installAuthRequestParsing(app);
    await app.init();

    // Setup Admin user & session
    const admin = await prisma.client.user.create({
      data: {
        email: "admin-import-test@example.com",
        name: "Admin User",
        role: "ADMIN",
        passwordHash: "$2b$12$dummyhash"
      }
    });
    const adminToken = "admin-import-test-token-12345678901234567890";
    await prisma.client.session.create({
      data: {
        id: createHash("sha256").update(adminToken).digest("hex"),
        userId: admin.id,
        expiresAt: new Date(Date.now() + 86400000)
      }
    });
    adminCookie = `shopsphere_session=${adminToken}`;

    // Setup Manager user & session
    const manager = await prisma.client.user.create({
      data: {
        id: 2,
        email: "manager-import-test@example.com",
        name: "Manager User",
        role: "INVENTORY_MANAGER",
        passwordHash: "$2b$12$dummyhash"
      }
    });
    const managerToken = "manager-import-test-token-12345678901234567890";
    await prisma.client.session.create({
      data: {
        id: createHash("sha256").update(managerToken).digest("hex"),
        userId: manager.id,
        expiresAt: new Date(Date.now() + 86400000)
      }
    });
    managerCookie = `shopsphere_session=${managerToken}`;

    // Setup Customer user & session
    const customer = await prisma.client.user.create({
      data: {
        email: "customer-import-test@example.com",
        name: "Customer User",
        role: "CUSTOMER",
        passwordHash: "$2b$12$dummyhash"
      }
    });
    const customerToken = "customer-import-test-token-12345678901234567890";
    await prisma.client.session.create({
      data: {
        id: createHash("sha256").update(customerToken).digest("hex"),
        userId: customer.id,
        expiresAt: new Date(Date.now() + 86400000)
      }
    });
    customerCookie = `shopsphere_session=${customerToken}`;

    // Get CSRF token
    const csrfRes = await request(app.getHttpServer()).get("/api/v1/auth/csrf");
    csrfToken = csrfRes.body.data.csrfToken;
    const cookie = csrfRes.headers["set-cookie"]?.find((c) => c.startsWith("shopsphere_csrf="));
    csrfCookie = cookie ? cookie.split(";")[0] : "";
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function authHeaders(cookie) {
    return {
      cookie: `${cookie}; ${csrfCookie}`,
      "x-csrf-token": csrfToken
    };
  }

  describe("1. Normal CSV / XLSX File Uploads via multipart/form-data", () => {
    it("successfully previews a valid CSV file upload", async () => {
      const csv = "Product Name,Category,Price,Description\nWireless Earbuds,Electronics,1499.00,Bluetooth 5.3";
      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import/preview")
        .set(authHeaders(adminCookie))
        .attach("file", Buffer.from(csv), "test-products.csv")
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.rowResults.length).toBe(1);
      expect(res.body.rowResults[0].status).toBe("valid");
      expect(res.body.rowResults[0].data.name).toBe("Wireless Earbuds");
    });

    it("successfully imports products directly via CSV file upload on /admin/products/import", async () => {
      const csv = "Product Name,Category,Price,Stock Quantity\nDesk Lamp,Home,899.00,20";
      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import")
        .set(authHeaders(adminCookie))
        .attach("file", Buffer.from(csv), "import-direct.csv")
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.results.successful).toBe(1);
      expect(res.body.results.failed).toBe(0);
    });

    it("successfully previews a valid Excel XLSX file upload", async () => {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet([
        ["Product Name", "Category", "Price", "Stock Quantity"],
        ["Mechanical Keyboard", "Electronics", 3499.0, 15]
      ]);
      xlsx.utils.book_append_sheet(wb, ws, "Products");
      const excelBuffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import/preview")
        .set(authHeaders(adminCookie))
        .attach("file", excelBuffer, "products.xlsx")
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.rowResults.length).toBe(1);
      expect(res.body.rowResults[0].status).toBe("valid");
      expect(res.body.rowResults[0].data.name).toBe("Mechanical Keyboard");
    });

    it("successfully imports directly via XLSX file upload on /admin/products/import", async () => {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet([
        ["Product Name", "Category", "Price"],
        ["Ergonomic Chair", "Furniture", 8999.0]
      ]);
      xlsx.utils.book_append_sheet(wb, ws, "Products");
      const excelBuffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import")
        .set(authHeaders(adminCookie))
        .attach("file", excelBuffer, "furniture.xlsx")
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.results.successful).toBe(1);
    });
  });

  describe("2. Batch JSON Payload (> 10KB) on Import Endpoints", () => {
    it("accepts a JSON batch payload larger than 10KB without throwing PayloadTooLargeError", async () => {
      // Build 30 products with descriptions and image URLs (~25KB JSON payload)
      const products = Array.from({ length: 30 }, (_, i) => ({
        rowNumber: i + 1,
        name: `Batch Product ${i + 1}`,
        category: "Test Category",
        price: 99.99 + i,
        description: `This is a detailed description for batch product ${i + 1} with extra text to increase the overall JSON payload size well above the 10kb limit.`,
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
        stockQuantity: 10 + i,
        lowStockThreshold: 2
      }));

      const payload = { products };
      const payloadSize = Buffer.byteLength(JSON.stringify(payload));
      expect(payloadSize).toBeGreaterThan(10 * 1024); // Verify size > 10KB

      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import")
        .set(authHeaders(adminCookie))
        .send(payload)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.results.total).toBe(30);
      expect(res.body.results.successful).toBe(30);
      expect(res.body.results.failed).toBe(0);
    });
  });

  describe("3. Payload Limit Enforcement", () => {
    it("rejects a file exceeding the 5MB upload limit with HTTP 413", async () => {
      // 5.5 MB dummy buffer
      const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, "a");

      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import/preview")
        .set(authHeaders(adminCookie))
        .attach("file", oversizedBuffer, "oversized.csv")
        .expect(413);

      expect(res.body.error.message).toMatch(/exceeds/i);
    });

    it("rejects a JSON payload exceeding the route-specific 5MB limit with HTTP 413", async () => {
      // Generate a string that creates > 5MB JSON
      const largeString = "x".repeat(5.2 * 1024 * 1024);
      const oversizedPayload = {
        products: [{ name: largeString, category: "Large", price: 10 }]
      };

      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import")
        .set(authHeaders(adminCookie))
        .send(oversizedPayload)
        .expect(413);

      expect(res.body.error.message).toMatch(/exceeds/i);
    });

    it("strictly enforces the tight 10kb limit on non-import endpoints", async () => {
      // Generate a 15KB body sent to a non-import endpoint (e.g. /api/v1/admin/products)
      const largeDescription = "y".repeat(15 * 1024);
      const res = await request(app.getHttpServer())
        .post("/api/v1/products")
        .set(authHeaders(adminCookie))
        .send({
          name: "Test",
          category: "General",
          price: 10,
          description: largeDescription
        })
        .expect(413);

      expect(res.body.error.message).toMatch(/exceeds/i);
    });
  });

  describe("4. Malformed Input & Invalid File Types", () => {
    it("returns HTTP 400 for malformed JSON on import endpoint", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import")
        .set(authHeaders(adminCookie))
        .set("Content-Type", "application/json")
        .send('{"products": [ { invalid json ')
        .expect(400);

      expect(res.body.error.message).toMatch(/invalid json/i);
    });

    it("returns HTTP 400 when file type is not CSV or Excel", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import/preview")
        .set(authHeaders(adminCookie))
        .attach("file", Buffer.from("plain text content"), "test.txt")
        .expect(400);

      expect(res.body.error.message).toMatch(/Only CSV and Excel/i);
    });

    it("returns HTTP 400 when CSV is missing required headers", async () => {
      const badCsv = "Product Name,Description\nIncomplete Item,No price or category";
      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import/preview")
        .set(authHeaders(adminCookie))
        .attach("file", Buffer.from(badCsv), "missing-headers.csv")
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.headerValidation.valid).toBe(false);
    });
  });

  describe("5. Duplicate Products Detection", () => {
    it("detects and skips duplicate products matching existing database records", async () => {
      const payload = {
        products: [
          { rowNumber: 1, name: "Existing Keyboard", category: "Electronics", price: 2999 },
          { rowNumber: 2, name: "Unique Mouse", category: "Electronics", price: 999 }
        ]
      };

      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/products/import")
        .set(authHeaders(adminCookie))
        .send(payload)
        .expect(200);

      expect(res.body.results.total).toBe(2);
      expect(res.body.results.successful).toBe(1);
      expect(res.body.results.skipped).toBe(1);
      expect(res.body.results.errors.some((e) => e.error.includes("already exists"))).toBe(true);
    });
  });

  describe("6. Authentication & Role Permissions", () => {
    it("blocks unauthenticated access with HTTP 401", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/admin/products/import")
        .send({ products: [] })
        .expect(401);

      await request(app.getHttpServer())
        .post("/api/v1/admin/products/import/preview")
        .attach("file", Buffer.from("name,category,price\nP,C,1"), "test.csv")
        .expect(401);
    });

    it("blocks unauthorized customer access with HTTP 403", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/admin/products/import")
        .set(authHeaders(customerCookie))
        .send({ products: [] })
        .expect(403);
    });

    it("allows manager with CREATE_PRODUCTS permission to preview and import", async () => {
      const csv = "Product Name,Category,Price\nManager Coffee Mug,Kitchen,299.00";
      const previewRes = await request(app.getHttpServer())
        .post("/api/v1/manager/products/import/preview")
        .set(authHeaders(managerCookie))
        .attach("file", Buffer.from(csv), "manager.csv")
        .expect(200);

      expect(previewRes.body.success).toBe(true);

      const importRes = await request(app.getHttpServer())
        .post("/api/v1/manager/products/import")
        .set(authHeaders(managerCookie))
        .send({
          products: [{ rowNumber: 1, name: "Manager Coffee Mug", category: "Kitchen", price: 299 }]
        })
        .expect(200);

      expect(importRes.body.results.successful).toBe(1);
    });
  });
});
