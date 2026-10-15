const { BadRequestException } = require("@nestjs/common");
const { AdminService, couponInput, rangeStart, salesTimeline } = require("../src/admin/admin.service");

describe("NestJS administrator data services", () => {
  it("returns only database table names and exact row counts for diagnostics", async () => {
    const prisma = {
      async $queryRaw(strings) {
        const query = strings.join("");
        if (query.includes("SELECT DATABASE()")) return [{ databaseName: "railway" }];
        return [{ tableName: "product" }, { tableName: "category" }];
      },
      async $queryRawUnsafe(query) {
        expect(query).toMatch(/^SELECT COUNT\(\*\) AS rowCount FROM `(?:product|category)`$/);
        return [{ rowCount: query.includes("product") ? 5n : 4n }];
      }
    };
    const service = new AdminService({ client: prisma });

    await expect(service.databaseInventory()).resolves.toEqual({
      databaseName: "railway",
      tables: [
        { name: "product", rowCount: "5" },
        { name: "category", rowCount: "4" }
      ]
    });
  });

  it("returns customer order totals only for captured payments", async () => {
    const service = new AdminService({
      client: {
        user: {
          async findMany() {
            return [{
              id: 1,
              name: "Customer",
              email: "customer@example.invalid",
              emailVerifiedAt: new Date(),
              order: [
                {
                  status: "PAID",
                  totalAmount: "20.00",
                  payment: { status: "CAPTURED" }
                },
                {
                  status: "PAID",
                  totalAmount: "100.00",
                  payment: { status: "PENDING" }
                }
              ]
            }];
          }
        }
      }
    });

    await expect(service.customers()).resolves.toEqual([{
      id: 1,
      name: "Customer",
      email: "customer@example.invalid",
      emailVerifiedAt: expect.any(Date),
      totalOrders: 2,
      paidOrdersCount: 1,
      totalSpent: 20
    }]);
  });

  it("validates and persists coupons using the existing Prisma model fields", async () => {
    let created;
    const service = new AdminService({
      client: {
        coupon: {
          async create({ data }) {
            created = data;
            return { id: 2, ...data };
          }
        }
      }
    });

    await expect(service.createCoupon({
      code: " spring-10 ",
      discount: 10,
      discountType: "PERCENTAGE",
      minSpend: "25.50",
      startsAt: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-12-01T00:00:00.000Z",
      usageLimit: 25,
      description: " Spring discount "
    })).resolves.toMatchObject({
      code: "SPRING-10",
      discount: 10,
      discountType: "PERCENTAGE",
      minSpend: 25.5,
      startsAt: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      usageLimit: 25,
      description: "Spring discount",
      isActive: true
    });
    expect(created.updatedAt).toEqual(expect.any(Date));
    expect(couponInput({ code: "FLAT25", discount: 25, discountType: "FIXED" }))
      .toMatchObject({ code: "FLAT25", discountType: "FIXED" });
    expect(() => couponInput({ code: "A", discount: 101 })).toThrow(BadRequestException);
    expect(() => couponInput({ code: "BADLIMIT", discount: 10, usageLimit: 0 })).toThrow(BadRequestException);
  });

  it("reports verified revenue and matching frontend dashboard data", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const service = new AdminService({
      client: {
        order: {
          async findMany() {
            return [
              {
                id: 3,
                status: "PAID",
                totalAmount: "25.00",
                createdAt: now,
                user: { name: "Customer", email: "customer@example.invalid" },
                payment: { status: "CAPTURED" },
                orderitem: [{
                  productName: "Mug",
                  quantity: 2,
                  unitPrice: "12.50",
                  product: { category: "Home" }
                }]
              },
              {
                id: 4,
                status: "PAID",
                totalAmount: "50.00",
                createdAt: now,
                user: { name: "Customer", email: "customer@example.invalid" },
                payment: { status: "PENDING" },
                orderitem: []
              }
            ];
          }
        },
        product: {
          async count({ where } = {}) {
            return where?.inStock === true ? 4 : 5;
          }
        },
        user: {
          async count() {
            return 6;
          }
        }
      }
    });

    const report = await service.reports({ range: "all" });
    expect(report.metrics).toEqual({
      totalRevenue: 25,
      totalOrders: 2,
      totalCustomers: 6,
      totalProducts: 5,
      inStockProducts: 4,
      outOfStockProducts: 1,
      pendingOrders: 0,
      completedOrders: 1,
      failedOrders: 0,
      averageOrderValue: 25
    });
    expect(report.salesOverTime).toEqual([{
      date: "2026-10",
      revenue: 25,
      salesCount: 1,
      unitsSold: 2
    }]);
    expect(report.orderStatusDistribution).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "PAID", value: 2 }),
      expect.objectContaining({ status: "PAYMENT_PENDING", value: 0 })
    ]));
    expect(report.recentOrders[0]).toMatchObject({
      id: 3,
      customerName: "Customer",
      customerEmail: "customer@example.invalid",
      itemCount: 2,
      totalAmount: 25
    });
    expect(report.bestSellingProducts).toEqual([{
      name: "Mug",
      unitsSold: 2,
      revenue: 25,
      category: "Home"
    }]);
  });

  it("builds continuous daily and monthly chart buckets with real paid order counts", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-15T12:00:00Z"));
    try {
      expect(rangeStart("7d")).toEqual(new Date("2026-10-09T00:00:00.000Z"));
      const daily = salesTimeline(
        [{ createdAt: new Date("2026-10-15T09:00:00Z") }],
        [{
          createdAt: new Date("2026-10-15T09:00:00Z"),
          totalAmount: "40.00",
          orderitem: [{ quantity: 3 }]
        }],
        "7d",
        rangeStart("7d")
      );
      expect(daily).toHaveLength(7);
      expect(daily[0]).toMatchObject({ date: "2026-10-09", revenue: 0, salesCount: 0, unitsSold: 0 });
      expect(daily[6]).toMatchObject({ date: "2026-10-15", revenue: 40, salesCount: 1, unitsSold: 3 });

      const monthly = salesTimeline(
        [
          { createdAt: new Date("2026-08-02T00:00:00Z") },
          { createdAt: new Date("2026-10-15T00:00:00Z") }
        ],
        [{
          createdAt: new Date("2026-08-02T00:00:00Z"),
          totalAmount: "12.50",
          orderitem: [{ quantity: 1 }]
        }],
        "all"
      );
      expect(monthly).toEqual([
        { date: "2026-08", revenue: 12.5, salesCount: 1, unitsSold: 1 },
        { date: "2026-09", revenue: 0, salesCount: 0, unitsSold: 0 },
        { date: "2026-10", revenue: 0, salesCount: 0, unitsSold: 0 }
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  describe("Cloudinary product image operations", () => {
    const originalEnvironment = {};

    beforeEach(() => {
      for (const key of [
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET"
      ]) {
        originalEnvironment[key] = process.env[key];
      }
      process.env.CLOUDINARY_CLOUD_NAME = "shopsphere-test";
      process.env.CLOUDINARY_API_KEY = "test-api-key";
      process.env.CLOUDINARY_API_SECRET = "test-api-secret";
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        delete originalEnvironment[key];
      }
      jest.restoreAllMocks();
    });

    it("streams a validated image to Cloudinary and returns its real asset metadata", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        async json() {
          return {
            secure_url: "https://res.cloudinary.com/shopsphere-test/image/upload/shopsphere/products/item.png",
            public_id: "shopsphere/products/item"
          };
        }
      });
      const service = new AdminService({ client: {} });
      const uploadRequest = {
        headers: { "content-type": "image/png", "content-length": "3" },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from([1, 2, 3]);
        }
      };

      await expect(service.uploadProductImage(uploadRequest)).resolves.toEqual({
        imageUrl: "https://res.cloudinary.com/shopsphere-test/image/upload/shopsphere/products/item.png",
        imagePublicId: "shopsphere/products/item"
      });
      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe("https://api.cloudinary.com/v1_1/shopsphere-test/image/upload");
      expect(options.body.get("folder")).toBe("shopsphere/products");
      expect(options.body.get("api_key")).toBe("test-api-key");
      expect(options.body.get("file").type).toBe("image/png");
    });

    it("rejects unsupported and oversized uploads before contacting Cloudinary", async () => {
      jest.spyOn(global, "fetch");
      const service = new AdminService({ client: {} });
      await expect(service.uploadProductImage({
        headers: { "content-type": "text/plain" }
      })).rejects.toThrow(BadRequestException);
      await expect(service.uploadProductImage({
        headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) }
      })).rejects.toThrow(BadRequestException);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("signs restricted asset deletion and treats an already-removed image as cleaned up", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        async json() {
          return { result: "not found" };
        }
      });
      const service = new AdminService({ client: {} });

      await expect(service.deleteProductImage({
        imagePublicId: "shopsphere/products/item"
      })).resolves.toEqual({ deleted: true });
      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe("https://api.cloudinary.com/v1_1/shopsphere-test/image/destroy");
      expect(new URLSearchParams(options.body).get("public_id")).toBe("shopsphere/products/item");
      await expect(service.deleteProductImage({
        imagePublicId: "other-folder/private-asset"
      })).rejects.toThrow(BadRequestException);
    });
  });
});
