describe("NestJS startup configuration", () => {
  it("defaults to a fixed development port and honors explicit valid overrides", () => {
    const { DEFAULT_PORT, getNestServerConfig } = require("../src/main");
    expect(DEFAULT_PORT).toBe(3004);
    expect(getNestServerConfig({})).toEqual({ host: "127.0.0.1", port: 3004 });
    expect(getNestServerConfig({ HOST: "0.0.0.0", PORT: "3010" }))
      .toEqual({ host: "0.0.0.0", port: 3010 });
    expect(() => getNestServerConfig({ PORT: "0" }))
      .toThrow("PORT must be an integer between 1 and 65535");
    expect(() => getNestServerConfig({ PORT: "not-a-port" }))
      .toThrow("PORT must be an integer between 1 and 65535");
  });

  it("shares one startup promise so the Nest app is only created and listened once", async () => {
    const originalEnvironment = {
      DATABASE_URL: process.env.DATABASE_URL,
      CSRF_SECRET: process.env.CSRF_SECRET,
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV
    };
    process.env.DATABASE_URL = "mysql://user:password@127.0.0.1:3306/shopsphere";
    process.env.CSRF_SECRET = "startup-test-secret-at-least-32-bytes-long";
    process.env.PORT = "3010";
    process.env.NODE_ENV = "test";

    jest.resetModules();
    const { NestFactory } = require("@nestjs/core");
    const { NestStartupError, bootstrap } = require("../src/main");
    const fakeApp = {
      use: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalFilters: jest.fn(),
      enableShutdownHooks: jest.fn(),
      listen: jest.fn(async () => {}),
      getHttpServer: () => ({ address: () => ({ port: 3010 }) }),
      close: jest.fn(async () => {})
    };
    const createSpy = jest.spyOn(NestFactory, "create").mockResolvedValue(fakeApp);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const first = bootstrap();
      const second = bootstrap();
      expect(first).toBe(second);
      await expect(first).resolves.toBe(fakeApp);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(fakeApp.listen).toHaveBeenCalledTimes(1);
      expect(fakeApp.listen).toHaveBeenCalledWith(3010, "127.0.0.1");
      expect(logSpy).toHaveBeenCalledWith(
        "ShopSphere NestJS API listening at http://127.0.0.1:3010"
      );
      expect(NestStartupError).toBeDefined();
    } finally {
      createSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
      for (const [name, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("turns address-in-use startup failures into an actionable error", async () => {
    const originalEnvironment = {
      DATABASE_URL: process.env.DATABASE_URL,
      CSRF_SECRET: process.env.CSRF_SECRET,
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV
    };
    process.env.DATABASE_URL = "mysql://user:password@127.0.0.1:3306/shopsphere";
    process.env.CSRF_SECRET = "startup-test-secret-at-least-32-bytes-long";
    process.env.PORT = "3010";
    process.env.NODE_ENV = "test";

    jest.resetModules();
    const { NestFactory } = require("@nestjs/core");
    const { NestStartupError, bootstrap } = require("../src/main");
    const addressError = Object.assign(new Error("address already in use"), {
      code: "EADDRINUSE"
    });
    const fakeApp = {
      use: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalFilters: jest.fn(),
      enableShutdownHooks: jest.fn(),
      listen: jest.fn().mockRejectedValue(addressError),
      close: jest.fn(async () => {})
    };
    const createSpy = jest.spyOn(NestFactory, "create").mockResolvedValue(fakeApp);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await expect(bootstrap()).rejects.toMatchObject({
        name: NestStartupError.name,
        message: expect.stringContaining("Port 3010 on 127.0.0.1 is already in use. Keep the existing service running"),
      });
      await expect(bootstrap()).rejects.toThrow("address already in use");
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(fakeApp.close).toHaveBeenCalledTimes(1);
    } finally {
      createSpy.mockRestore();
      warnSpy.mockRestore();
      for (const [name, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("reports database connectivity causes without exposing connection credentials", () => {
    const { describeStartupError } = require("../src/main");
    const error = Object.assign(
      new Error("Can't reach database server at `localhost:3306` using mysql://root:private-value@localhost/shopsphere"),
      { code: "P1001" }
    );
    const message = describeStartupError(error);
    expect(message).toContain("MySQL at localhost:3306 is unreachable (Prisma P1001)");
    expect(message).not.toContain("private-value");
  });
});
