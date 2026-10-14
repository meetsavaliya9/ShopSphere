const { ForbiddenException, UnauthorizedException } = require("@nestjs/common");
const { Test } = require("@nestjs/testing");
const request = require("supertest");
const { CategoryModule } = require("../src/categories/category.module");
const { AllExceptionsFilter } = require("../src/common/filters/all-exceptions.filter");
const { installCategoryRequestParsing } = require("../src/auth/auth-request-parsing");
const { CsrfGuard, SessionAuthGuard } = require("../src/auth/auth-security");
const { PrismaService } = require("../src/prisma/prisma.service");

function createCategoryPrisma() {
  const categories = new Map([
    [1, {
      id: 1,
      name: "Accessories",
      slug: "accessories",
      description: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }]
  ]);
  const products = [
    { id: 1, name: "Existing item", category: "Accessories", price: 12.5, inStock: true },
    { id: 2, name: "Out of stock", category: "Accessories", price: 7.5, inStock: false }
  ];
  const client = {
    category: {
      async findMany() {
        return [...categories.values()].sort((left, right) => left.name.localeCompare(right.name));
      },
      async findUnique({ where }) {
        return [...categories.values()].find((category) =>
          where.id !== undefined
            ? category.id === Number(where.id)
            : where.name !== undefined
              ? category.name.toLowerCase() === where.name.toLowerCase()
              : false
        ) || null;
      },
      async create({ data }) {
        if ([...categories.values()].some((category) =>
          category.name.toLowerCase() === data.name.toLowerCase() || category.slug === data.slug
        )) {
          const error = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }
        const category = {
          ...data,
          id: Math.max(0, ...categories.keys()) + 1,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        categories.set(category.id, category);
        return category;
      },
      async update({ where, data }) {
        const current = categories.get(where.id);
        if (!current) throw new Error("Category missing");
        if ([...categories.values()].some((category) =>
          category.id !== where.id &&
          (category.name.toLowerCase() === data.name?.toLowerCase() || category.slug === data.slug)
        )) {
          const error = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }
        const updated = { ...current, ...data, updatedAt: new Date() };
        categories.set(where.id, updated);
        return updated;
      },
      async delete({ where }) {
        const category = categories.get(Number(where.id));
        categories.delete(Number(where.id));
        return category;
      }
    },
    product: {
      async findMany() {
        return products.map(({ category, price, inStock }) => ({ category, price, inStock }));
      },
      async count({ where }) {
        return products.filter((product) => product.category === where.category).length;
      },
      async updateMany({ where, data }) {
        const matched = products.filter((product) => product.category === where.category);
        for (const product of matched) Object.assign(product, data);
        return { count: matched.length };
      }
    },
    async $transaction(callback) {
      return callback(client);
    }
  };
  return { client, categories, products };
}

describe("native category API", () => {
  let app;
  let prisma;
  const originalCsrfSecret = process.env.CSRF_SECRET;

  beforeAll(async () => {
    process.env.CSRF_SECRET = "category-tests-only-csrf-secret-not-for-production";
    prisma = createCategoryPrisma();
    const testingModule = await Test.createTestingModule({
      imports: [CategoryModule]
    })
      .overrideProvider(PrismaService)
      .useValue({ client: prisma.client })
      .overrideGuard(CsrfGuard)
      .useValue({
        canActivate(context) {
          const requestContext = context.switchToHttp().getRequest();
          if (
            requestContext.cookies?.shopsphere_csrf !== "test-csrf" ||
            requestContext.get("x-csrf-token") !== "test-csrf"
          ) {
            throw new ForbiddenException("Request verification failed.");
          }
          return true;
        }
      })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate(context) {
          const requestContext = context.switchToHttp().getRequest();
          const role = requestContext.get("x-test-role");
          if (!role) throw new UnauthorizedException("Authentication required");
          requestContext.user = { id: 1, role };
          return true;
        }
      })
      .compile();

    app = testingModule.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new AllExceptionsFilter());
    installCategoryRequestParsing(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalCsrfSecret === undefined) delete process.env.CSRF_SECRET;
    else process.env.CSRF_SECRET = originalCsrfSecret;
  });

  it("requires an authenticated administrator to list categories", async () => {
    await request(app.getHttpServer()).get("/api/v1/admin/categories").expect(401);
    await request(app.getHttpServer())
      .get("/api/v1/admin/categories")
      .set("x-test-role", "MANAGER")
      .expect(403);
  });

  it("lists legacy product categories with product counts", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/admin/categories")
      .set("x-test-role", "ADMIN")
      .expect(200);

    expect(response.body.data).toEqual([
      expect.objectContaining({
        name: "Accessories",
        slug: "accessories",
        productCount: 2,
        inStockCount: 1,
        totalValue: 20
      })
    ]);
  });

  it("creates categories, validates duplicates and requires CSRF on mutations", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/admin/categories")
      .set("x-test-role", "ADMIN")
      .send({ name: "Home Goods", slug: "home-goods" })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post("/api/v1/admin/categories")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({ name: "Home Goods", slug: "home-goods", description: "Home essentials" })
      .expect(201);
    expect(created.body.data).toMatchObject({
      name: "Home Goods",
      slug: "home-goods",
      description: "Home essentials"
    });
    expect(created.body.data.id).toEqual(expect.any(Number));

    await request(app.getHttpServer())
      .post("/api/v1/admin/categories")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({ name: "Home Goods", slug: "another-slug" })
      .expect(409);
    await request(app.getHttpServer())
      .post("/api/v1/admin/categories")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({ name: "", slug: "" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/admin/categories")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({ name: "Invalid slug", slug: 12 })
      .expect(400);
  });

  it("updates categories used by products and protects categories from deletion", async () => {
    const response = await request(app.getHttpServer())
      .patch("/api/v1/admin/categories/1")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({ name: "Home & Living", slug: "home-living" })
      .expect(200);

    expect(response.body.data.name).toBe("Home & Living");
    expect(prisma.products.every((product) => product.category === "Home & Living")).toBe(true);
    await request(app.getHttpServer())
      .delete("/api/v1/admin/categories/1")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .expect(409);
  });

  it("lets admins edit legacy product categories and offers protected deletion", async () => {
    prisma.products.push({
      id: 3,
      name: "Legacy light",
      category: "Legacy Lighting",
      price: 20,
      inStock: true
    });

    await request(app.getHttpServer())
      .delete("/api/v1/admin/categories/legacy/Legacy%20Lighting")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .expect(409)
      .expect({
        error: {
          message: "This category is assigned to products. Reassign those products before deleting it."
        }
      });

    const updated = await request(app.getHttpServer())
      .patch("/api/v1/admin/categories/legacy/Legacy%20Lighting")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({ name: "Lighting", slug: "lighting", description: null })
      .expect(200);

    expect(updated.body.data).toMatchObject({
      name: "Lighting",
      slug: "lighting"
    });
    expect(prisma.products.find((product) => product.id === 3).category).toBe("Lighting");
  });

  it("deletes an unused category", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/admin/categories")
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .send({ name: "Unused", slug: "unused" })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${created.body.data.id}`)
      .set("x-test-role", "ADMIN")
      .set("Cookie", "shopsphere_csrf=test-csrf")
      .set("x-csrf-token", "test-csrf")
      .expect(200)
      .expect({ data: { deleted: true } });
  });
});
