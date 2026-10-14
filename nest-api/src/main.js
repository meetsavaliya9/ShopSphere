const { loadNestEnvironment, validateNestEnvironment } = require("./config/environment");

loadNestEnvironment();

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("./app.module");
const {
  installAuthRequestParsing,
  installCategoryRequestParsing
} = require("./auth/auth-request-parsing");
const { AllExceptionsFilter } = require("./common/filters/all-exceptions.filter");

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 3004;
let bootstrapPromise;

class NestStartupError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "NestStartupError";
  }
}

function findRootCause(error) {
  let current = error;
  while (current?.cause && current.cause !== current) current = current.cause;
  return current || error;
}

function sanitizeStartupMessage(message) {
  return String(message || "Unknown startup error")
    .replace(/mysql:\/\/[^\s"'<>]+/gi, "mysql://<redacted>")
    .replace(/mariadb:\/\/[^\s"'<>]+/gi, "mariadb://<redacted>");
}

function describeStartupError(error) {
  const rootCause = findRootCause(error);
  const code = rootCause?.code || error?.code;
  if (code === "EADDRINUSE") {
    return `${sanitizeStartupMessage(error.message)} Underlying error: ${sanitizeStartupMessage(rootCause.message)}.`;
  }
  if (code === "P1001" || code === "P1002") {
    let target = "the configured MySQL host and port";
    try {
      const databaseUrl = new URL(process.env.DATABASE_URL);
      target = `${databaseUrl.hostname}:${databaseUrl.port || "3306"}`;
    } catch {
      // Configuration validation reports malformed URLs before Prisma starts.
    }
    return `MySQL at ${target} is unreachable (Prisma ${code}). ${sanitizeStartupMessage(rootCause.message)}`;
  }
  return `${sanitizeStartupMessage(error.message)} Underlying error: ${sanitizeStartupMessage(rootCause.message)}.`;
}

function getNestServerConfig(environment = process.env) {
  const host = environment.HOST || DEFAULT_HOST;
  const port = environment.PORT === undefined || environment.PORT === ""
    ? DEFAULT_PORT
    : Number(environment.PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return { host, port };
}

async function startApplication() {
  validateNestEnvironment();
  const { host, port } = getNestServerConfig();
  let app;
  try {
    app = await NestFactory.create(AppModule, { bodyParser: false });
    installAuthRequestParsing(app);
    installCategoryRequestParsing(app);
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new AllExceptionsFilter());
    app.enableShutdownHooks();
    await app.listen(port, host);
    const address = app.getHttpServer().address();
    const actualPort = address && typeof address === "object" ? address.port : port;
    console.log(`ShopSphere NestJS API listening at http://${host}:${actualPort}`);
    return app;
  } catch (error) {
    if (app) {
      try {
        await app.close();
      } catch {
        // Keep the original startup error for the actionable message below.
      }
    }
    if (error?.code === "EADDRINUSE") {
      throw new NestStartupError(
        `Port ${port} on ${host} is already in use. Keep the existing service running or stop only the verified duplicate API process. Underlying error: ${sanitizeStartupMessage(error.message)}`,
        { cause: error }
      );
    }
    throw new NestStartupError(
      `Could not start NestJS API on ${host}:${port}. ${describeStartupError(error)}`,
      { cause: error }
    );
  }
}

function bootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = startApplication();
  }
  return bootstrapPromise;
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  NestStartupError,
  bootstrap,
  getNestServerConfig,
  describeStartupError,
  sanitizeStartupMessage
};
