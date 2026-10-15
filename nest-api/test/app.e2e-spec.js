const { Test } = require("@nestjs/testing");
const request = require("supertest");
const { AppModule } = require("../src/app.module");
const { AllExceptionsFilter } = require("../src/common/filters/all-exceptions.filter");

describe("ShopSphere NestJS API", () => {
  let app;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves a native NestJS health contract", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200)
      .expect({
        data: { status: "ok", application: "ShopSphere NestJS API" }
      });
  });

  it("serves database-backed products through NestJS", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/products")
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty("pagination");
    if (response.body.data.length > 0) {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${response.body.data[0].id}`)
        .expect(200)
        .expect((productResponse) => {
          expect(productResponse.body.data.id).toBe(response.body.data[0].id);
        });
    }
  });

  it("issues a CSRF token and cookie through the NestJS listener", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/auth/csrf")
      .expect(200)
      .expect((response) => {
        expect(response.body.data.csrfToken).toEqual(expect.any(String));
        expect(response.headers["set-cookie"]).toEqual(
          expect.arrayContaining([expect.stringContaining("csrf")])
        );
      });
  });

  it("rejects unauthenticated access to the current-user endpoint", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .expect(401);
  });

  it.each([
    ["admin overview", "get", "/api/v1/admin/overview"],
    ["admin database inventory", "get", "/api/v1/admin/database-inventory"],
    ["admin customers", "get", "/api/v1/admin/customers"],
    ["admin coupons", "get", "/api/v1/admin/coupons"],
    ["admin reports", "get", "/api/v1/admin/reports"],
    ["admin product management", "get", "/api/v1/admin/products"],
    ["admin inventory", "get", "/api/v1/admin/inventory"],
    ["customer orders", "get", "/api/v1/orders"],
    ["admin orders", "get", "/api/v1/admin/orders"],
    ["admin payments", "get", "/api/v1/admin/payments"],
    ["manager inventory", "get", "/api/v1/manager/products"],
    ["customer cart", "get", "/api/v1/cart"],
    ["customer wishlist", "get", "/api/v1/wishlist"]
  ])("preserves authentication for %s", async (_name, method, endpoint) => {
    await request(app.getHttpServer())[method](endpoint).expect(401);
  });
});
