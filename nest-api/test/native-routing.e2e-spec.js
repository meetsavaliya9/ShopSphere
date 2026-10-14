const { Test } = require("@nestjs/testing");
const { createHash } = require("node:crypto");
const request = require("supertest");
const { AUTH_SERVICE_OPTIONS } = require("../src/auth/auth.service");
const { installAuthRequestParsing } = require("../src/auth/auth-request-parsing");
const { AppModule } = require("../src/app.module");
const { AllExceptionsFilter } = require("../src/common/filters/all-exceptions.filter");
const { OrderService } = require("../src/orders/order.service");
const { PrismaService } = require("../src/prisma/prisma.service");
const { createFakeAuthPrisma } = require("./helpers/fake-auth-prisma");

describe("Native NestJS routing", () => {
  let app;
  let prisma;

  beforeAll(async () => {
    process.env.CSRF_SECRET = "native-nest-routing-test-secret-at-least-32-bytes";
    process.env.NODE_ENV = "test";
    prisma = createFakeAuthPrisma();
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
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("handles CSRF, catalog and health routes natively", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/auth/csrf")
      .expect(200)
      .expect((response) => {
        expect(response.body.data.csrfToken).toEqual(expect.any(String));
        expect(response.headers["set-cookie"]).toEqual(
          expect.arrayContaining([expect.stringContaining("shopsphere_csrf=")])
        );
      });

    await request(app.getHttpServer())
      .get("/api/v1/products")
      .expect(200)
      .expect({ data: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 0 } });

    await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200)
      .expect({ data: { status: "ok", application: "ShopSphere NestJS API" } });
  });

  it("requires a signed-in account for customer and admin routes", async () => {
    for (const endpoint of [
      "/api/v1/admin/overview",
      "/api/v1/admin/customers",
      "/api/v1/admin/coupons",
      "/api/v1/admin/reports",
      "/api/v1/admin/products",
      "/api/v1/manager/products",
      "/api/v1/cart",
      "/api/v1/wishlist",
      "/api/v1/orders",
      "/api/v1/admin/orders",
      "/api/v1/admin/payments"
    ]) {
      await request(app.getHttpServer()).get(endpoint).expect(401);
    }
  });

  it("denies a signed-in customer access to admin APIs", async () => {
    const token = "native-routing-customer-admin-denial-session";
    const user = await prisma.client.user.create({
      data: {
        name: "Customer Admin Denial",
        email: "customer-admin-denial@example.test",
        passwordHash: "not-used-by-this-test",
        role: "CUSTOMER",
        emailVerifiedAt: new Date()
      }
    });
    await prisma.client.session.create({
      data: {
        id: createHash("sha256").update(token).digest("hex"),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000)
      }
    });

    await request(app.getHttpServer())
      .get("/api/v1/admin/overview")
      .set("Cookie", `shopsphere_session=${token}`)
      .expect(403)
      .expect({ error: { message: "Administrator access required." } });

    await request(app.getHttpServer())
      .get("/api/v1/admin/customer-permissions")
      .set("Cookie", `shopsphere_session=${token}`)
      .expect(403)
      .expect({ error: { message: "Administrator access required." } });

    await request(app.getHttpServer())
      .patch("/api/v1/admin/customer-permissions")
      .set("Cookie", `shopsphere_session=${token}`)
      .send({ permissions: [] })
      .expect(403)
      .expect({ error: { message: "Administrator access required." } });
  });

  it("routes an authenticated pre-order quote without interpreting quote as an order ID", async () => {
    const token = "native-routing-customer-session-token";
    const user = await prisma.client.user.create({
      data: {
        name: "Quote Customer",
        email: "quote-customer@example.test",
        passwordHash: "not-used-by-this-test",
        role: "CUSTOMER",
        emailVerifiedAt: new Date()
      }
    });
    await prisma.client.session.create({
      data: {
        id: createHash("sha256").update(token).digest("hex"),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    prisma.client.cart.findUnique = async () => ({
      cartitem: [{
        quantity: 2,
        product: {
          id: 12,
          name: "Quote Product",
          price: "100.00",
          inStock: true,
          stockQuantity: 5
        }
      }]
    });

    await request(app.getHttpServer())
      .get("/api/v1/orders/quote")
      .set("Cookie", `shopsphere_session=${token}`)
      .expect(200)
      .expect({
        data: {
          subtotal: 200,
          discount: 0,
          shipping: 0,
          tax: 36,
          taxRatePercent: 18,
          total: 236,
          currency: "INR"
        }
      });

    prisma.client.coupon = {
      async findUnique({ where }) {
        return where.code === "ROUTE10" ? {
          id: 10,
          code: "ROUTE10",
          discount: 10,
          discountType: "PERCENTAGE",
          minSpend: "0.00",
          isActive: true,
          startsAt: null,
          expiresAt: null,
          usageLimit: null,
          usageCount: 0
        } : null;
      }
    };
    const csrfResponse = await request(app.getHttpServer())
      .get("/api/v1/auth/csrf")
      .expect(200);
    const csrfCookie = csrfResponse.headers["set-cookie"]
      .find((cookie) => cookie.startsWith("shopsphere_csrf="))
      .split(";")[0];
    await request(app.getHttpServer())
      .post("/api/v1/orders/quote")
      .set("Cookie", `shopsphere_session=${token}; ${csrfCookie}`)
      .set("X-CSRF-Token", csrfResponse.body.data.csrfToken)
      .send({ couponCode: "route10" })
      .expect(200)
      .expect({
        data: {
          subtotal: 200,
          discount: 20,
          shipping: 0,
          tax: 32.4,
          taxRatePercent: 18,
          total: 212.4,
          currency: "INR",
          couponCode: "ROUTE10",
          couponDiscountType: "PERCENTAGE"
        }
      });

    await request(app.getHttpServer())
      .get("/api/v1/orders/not-an-order-id")
      .set("Cookie", `shopsphere_session=${token}`)
      .expect(400)
      .expect((response) => {
        expect(response.body.error.message).toBe("Order ID is invalid.");
      });
  });

  it("rejects unsigned payment webhooks before processing them", async () => {
    const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = "native-routing-webhook-test-secret";
    try {
      await request(app.getHttpServer())
        .post("/api/v1/payments/razorpay/webhook")
        .set("x-razorpay-signature", "invalid")
        .send({ id: "evt_test", event: "payment.captured" })
        .expect(403);
    } finally {
      if (originalSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
      else process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    }
  });
});
