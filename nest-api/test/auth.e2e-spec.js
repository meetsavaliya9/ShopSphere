const { Test } = require("@nestjs/testing");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const { createFakeAuthPrisma } = require("./helpers/fake-auth-prisma");
const { comparePassword } = require("../src/auth/auth.service");
const { installAuthRequestParsing } = require("../src/auth/auth-request-parsing");
const {
  AUTH_SERVICE_OPTIONS,
  AuthService
} = require("../src/auth/auth.service");
const { AuthModule } = require("../src/auth/auth.module");
const { AuthRateLimitGuard } = require("../src/auth/auth-security");
const { AllExceptionsFilter } = require("../src/common/filters/all-exceptions.filter");
const { PrismaModule } = require("../src/prisma/prisma.module");
const { PrismaService } = require("../src/prisma/prisma.service");

const CSRF_SECRET = "native-nest-auth-test-secret-with-at-least-32-bytes";
const PASSWORD = "test-password-that-is-long-enough";
jest.setTimeout(30_000);

describe("Native NestJS authentication", () => {
  let app;
  let prisma;
  let sentOtps;
  let csrfToken;
  let csrfCookie;
  let adminSessionCookie;
  let testNow;
  let emailFailure;

  beforeAll(async () => {
    process.env.CSRF_SECRET = CSRF_SECRET;
    process.env.NODE_ENV = "test";
    prisma = createFakeAuthPrisma();
    sentOtps = [];
    testNow = new Date();
    const moduleFixture = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule]
    })
      .overrideProvider(PrismaService)
      .useValue({ client: prisma })
      .overrideProvider(AUTH_SERVICE_OPTIONS)
      .useValue({
        otpSecret: CSRF_SECRET,
        now: () => new Date(testNow),
        emailSender: {
          isConfigured: () => true,
          async sendCustomerOtp(email, code, purpose) {
            if (emailFailure) throw emailFailure;
            sentOtps.push({ email, code, purpose });
          }
        }
      })
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new AllExceptionsFilter());
    installAuthRequestParsing(app);
    await app.init();
    const csrfResponse = await request(app.getHttpServer())
      .get("/api/v1/auth/csrf")
      .expect(200);
    csrfToken = csrfResponse.body.data.csrfToken;
    csrfCookie = cookiePair(csrfResponse, "shopsphere_csrf");
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function cookiePair(response, name) {
    const cookie = response.headers["set-cookie"]
      ?.find((value) => value.startsWith(`${name}=`));
    return cookie ? cookie.split(";", 1)[0] : "";
  }

  function csrfHeaders(extraCookies = "") {
    return {
      "Content-Type": "application/json",
      Cookie: [csrfCookie, extraCookies].filter(Boolean).join("; "),
      "X-CSRF-Token": csrfToken
    };
  }

  it("rejects unsafe auth requests without CSRF and validates registration input", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ name: "Test", email: "test@example.com", password: PASSWORD })
      .expect(403);

    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set(csrfHeaders())
      .send({ name: "", email: "bad", password: "short" })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set(csrfHeaders())
      .set("Content-Type", "application/json")
      .send('{"email":')
      .expect(400)
      .expect({ error: { message: "Invalid JSON request body" } });

    expect(sentOtps).toHaveLength(0);
    expect(prisma.getUsers()).toHaveLength(0);
  });

  it("registers, verifies a customer OTP, creates a session, and returns the existing API shapes", async () => {
    const registration = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set(csrfHeaders())
      .send({
        name: "Native Customer",
        email: " CUSTOMER@EXAMPLE.COM ",
        password: PASSWORD,
        role: "ADMIN"
      })
      .expect(202);

    expect(registration.body).toMatchObject({
      data: {
        message: "A verification code has been sent to your email.",
        challengeId: expect.stringMatching(/^[a-f0-9]{64}$/),
        csrfToken
      }
    });
    expect(prisma.getUsers()[0].role).toBe("CUSTOMER");
    expect(prisma.getUsers()[0].updatedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(registration.body)).not.toContain(sentOtps[0].code);

    const verification = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .set(csrfHeaders())
      .send({
        challengeId: registration.body.data.challengeId,
        code: sentOtps[0].code
      })
      .expect(200);
    expect(verification.body.data.user).toMatchObject({
      id: 1,
      name: "Native Customer",
      email: "customer@example.com",
      role: "CUSTOMER",
      customerPermissions: expect.arrayContaining(["APPLY_COUPON", "ADD_TO_CART", "VIEW_ORDERS"])
    });

    const sessionCookie = cookiePair(verification, "shopsphere_session");
    expect(sessionCookie).toMatch(/^shopsphere_session=.{32,}$/);
    const storedSession = prisma.getSessions().find((session) => session.userId === 1);
    expect(storedSession.id).toMatch(/^[a-f0-9]{64}$/);
    expect(storedSession).not.toHaveProperty("tokenHash");
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie)
      .expect(200)
      .expect({ data: verification.body.data.user });
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set(csrfHeaders(sessionCookie))
      .send({})
      .expect(200)
      .expect({ data: { loggedOut: true, csrfToken } });
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .set(csrfHeaders())
      .send({
        challengeId: registration.body.data.challengeId,
        code: sentOtps[0].code
      })
      .expect(400)
      .expect({ error: { message: "The verification code is invalid or expired." } });

    const customerLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set(csrfHeaders())
      .send({ email: "customer@example.com", password: PASSWORD })
      .expect(202);
    expect(customerLogin.body.data.requiresEmailVerification).toBe(true);
    const loginOtp = sentOtps.at(-1);
    expect(loginOtp.purpose).toBe("login");
    await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .set(csrfHeaders())
      .send({
        challengeId: customerLogin.body.data.challengeId,
        code: loginOtp.code
      })
      .expect(200);
  });

  it("resends OTP through the same challenge contract without sending a real email", async () => {
    const registration = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set(csrfHeaders())
      .send({ name: "Resend Customer", email: "resend@example.com", password: PASSWORD })
      .expect(202);
    const originalChallengeId = registration.body.data.challengeId;

    const earlyResend = await request(app.getHttpServer())
      .post("/api/v1/auth/resend-otp")
      .set(csrfHeaders())
      .send({ challengeId: originalChallengeId })
      .expect(429);
    expect(earlyResend.body.error.message).toMatch(/wait before requesting/i);

    testNow = new Date(testNow.getTime() + 61_000);
    const resend = await request(app.getHttpServer())
      .post("/api/v1/auth/resend-otp")
      .set(csrfHeaders())
      .send({ challengeId: originalChallengeId })
      .expect(200);
    expect(resend.body.data.challengeId).not.toBe(originalChallengeId);
    const replacementOtp = sentOtps.at(-1);
    expect(replacementOtp.code).not.toBe(sentOtps.at(-2).code);

    await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .set(csrfHeaders())
      .send({ challengeId: resend.body.data.challengeId, code: replacementOtp.code })
      .expect(200);
  });

  it("allows existing Admin and Manager accounts to log in without customer OTP", async () => {
    const otpCount = sentOtps.length;
    for (const role of ["ADMIN", "MANAGER"]) {
      await prisma.user.create({
        data: {
          email: `${role.toLowerCase()}@example.com`,
          name: role,
          passwordHash: await bcrypt.hash(PASSWORD, 12),
          role,
          emailVerifiedAt: new Date()
        }
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set(csrfHeaders())
        .send({
          email: role === "ADMIN"
            ? " ADMIN@EXAMPLE.COM "
            : `${role.toLowerCase()}@example.com`,
          password: PASSWORD
        })
        .expect(200);
      expect(response.body.data.user.role).toBe(role);
      const sessionCookie = cookiePair(response, "shopsphere_session");
      expect(sessionCookie).toMatch(/^shopsphere_session=.{32,}$/);
      if (role === "ADMIN") {
        adminSessionCookie = sessionCookie;
        await request(app.getHttpServer())
          .get("/api/v1/auth/me")
          .set("Cookie", sessionCookie)
          .expect(200)
          .expect({ data: response.body.data.user });
      }
      if (role === "MANAGER") {
        const manager = prisma.getUsers().find((user) => user.email === "manager@example.com");
        const session = prisma.getSessions().find((entry) => entry.userId === manager.id);
        session.expiresAt = new Date(testNow.getTime() - 1);
        await request(app.getHttpServer())
          .get("/api/v1/auth/me")
          .set("Cookie", sessionCookie)
          .expect(401)
          .expect({ error: { message: "Authentication required" } });
        expect(prisma.getSessions()).not.toContain(session);
      }
    }
    expect(sentOtps).toHaveLength(otpCount);
  });

  it("creates a direct password session for an Inventory Manager", async () => {
    await prisma.user.create({
      data: {
        email: "inventory-manager@example.com",
        name: "Inventory Manager",
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        role: "INVENTORY_MANAGER",
        emailVerifiedAt: new Date()
      }
    });
    const auth = new AuthService(
      { client: prisma },
      { now: () => new Date(testNow), otpSecret: CSRF_SECRET }
    );
    const result = await auth.login({
      email: "inventory-manager@example.com",
      password: PASSWORD
    });

    expect(result.user).toMatchObject({
      name: "Inventory Manager",
      role: "INVENTORY_MANAGER"
    });
    await expect(auth.getSessionUser(result.token)).resolves.toMatchObject({
      role: "INVENTORY_MANAGER"
    });
  });

  it("logs out a Manager session and rejects subsequent profile access", async () => {
    await prisma.user.create({
      data: {
        email: "manager-logout@example.com",
        name: "Manager Logout",
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        role: "MANAGER",
        emailVerifiedAt: new Date()
      }
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set(csrfHeaders())
      .send({ email: "manager-logout@example.com", password: PASSWORD })
      .expect(200);
    const sessionCookie = cookiePair(login, "shopsphere_session");

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie)
      .expect(200)
      .expect({ data: login.body.data.user });
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set(csrfHeaders(sessionCookie))
      .send({})
      .expect(200)
      .expect({ data: { loggedOut: true, csrfToken } });
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie)
      .expect(401);
  });

  it("rejects invalid credentials and unauthenticated profile access", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set(csrfHeaders())
      .send({ email: "admin@example.com", password: `${PASSWORD}-incorrect` })
      .expect(401)
      .expect({ error: { message: "Invalid email or password" } });

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set(csrfHeaders())
      .send({ email: "admin@example.com", password: `${PASSWORD}-incorrect` })
      .expect(401)
      .expect({ error: { message: "Invalid email or password" } });

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .expect(401)
      .expect({ error: { message: "Authentication required" } });

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", "shopsphere_session=invalid-session-token")
      .expect(401)
      .expect({ error: { message: "Authentication required" } });

    await request(app.getHttpServer())
      .patch("/api/v1/auth/me")
      .set(csrfHeaders())
      .send({ name: "Not signed in" })
      .expect(401);
  });

  it("supports profile, password, and logout contracts with session revocation", async () => {
    const updatedProfile = await request(app.getHttpServer())
      .patch("/api/v1/auth/me")
      .set(csrfHeaders(adminSessionCookie))
      .send({ name: "Updated Admin" })
      .expect(200);
    expect(updatedProfile.body.data.name).toBe("Updated Admin");
    expect(updatedProfile.body.data.email).toBe("admin@example.com");

    await request(app.getHttpServer())
      .patch("/api/v1/auth/me/password")
      .set(csrfHeaders(adminSessionCookie))
      .send({ currentPassword: PASSWORD, newPassword: "new-admin-password-long-enough" })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.passwordChanged).toBe(true);
      });
    const updatedAdmin = prisma.getUsers().find((user) => user.email === "admin@example.com");
    expect(await comparePassword("new-admin-password-long-enough", updatedAdmin.passwordHash)).toBe(true);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", adminSessionCookie)
      .expect(401);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set(csrfHeaders())
      .send({
        email: "admin@example.com",
        password: "new-admin-password-long-enough"
      })
      .expect((response) => {
        if (response.status !== 200) throw new Error(JSON.stringify(response.body));
      })
      .expect(200);
    const freshSession = cookiePair(login, "shopsphere_session");
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set(csrfHeaders(freshSession))
      .send({})
      .expect(200)
      .expect({ data: { loggedOut: true, csrfToken } });
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", freshSession)
      .expect(401);
  });

  it("returns a safe 500 and logs diagnostics for genuine session lookup failures", async () => {
    const findUnique = prisma.session.findUnique;
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    prisma.session.findUnique = async () => {
      throw Object.assign(
        new Error(
          "Database connection unavailable; session=do-not-log-this-session password=do-not-log-this-password mysql://root:do-not-log-this-db-password@localhost"
        ),
        { code: "P1001" }
      );
    };

    try {
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", "shopsphere_session=valid-shaped-session-token")
        .expect(500)
        .expect({ error: { message: "Internal server error" } });
      expect(errorLog).toHaveBeenCalledWith("Unhandled NestJS API error:", {
        name: "Error",
        code: "P1001",
        message: "Database connection unavailable; session=[REDACTED] password=[REDACTED] mysql://[REDACTED]@localhost",
        stack: expect.stringContaining("Database connection unavailable")
      });
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain("do-not-log-this");
    } finally {
      prisma.session.findUnique = findUnique;
      errorLog.mockRestore();
    }
  });

  it("rate-limits authentication attempts using the existing login threshold", async () => {
    app.get(AuthRateLimitGuard).requests.clear();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set(csrfHeaders())
        .send({ email: "rate-limit@example.com", password: PASSWORD })
        .expect(401);
    }

    const limited = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set(csrfHeaders())
      .send({ email: "rate-limit@example.com", password: PASSWORD })
      .expect(429);
    expect(limited.body.error.message).toBe("Too many authentication attempts. Try again later.");
  });

  it("returns 503 and removes the unverified account when SMTP delivery fails", async () => {
    emailFailure = Object.assign(new Error("SMTP connection timed out"), {
      code: "ETIMEDOUT",
      command: "CONN"
    });
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .set(csrfHeaders())
        .send({
          name: "Pending Customer",
          email: "smtp-failure@example.com",
          password: PASSWORD
        })
        .expect(503)
        .expect({
          error: {
            message: "The verification email could not be sent. Check SMTP configuration and try again later."
          }
        });

      expect(prisma.getUsers().some((user) => user.email === "smtp-failure@example.com")).toBe(false);
      expect(errorLog).toHaveBeenCalledWith("Customer OTP email delivery failed:", {
        purpose: "registration",
        name: "Error",
        code: "ETIMEDOUT",
        command: "CONN",
        responseCode: null,
        syscall: undefined
      });
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(PASSWORD);
    } finally {
      emailFailure = undefined;
      errorLog.mockRestore();
    }
  });
});
