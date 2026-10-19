const path = require("node:path");

const NEST_ENV_FILE = path.resolve(__dirname, "../../.env");

const OPTIONAL_FEATURES = [
  {
    name: "SMTP email OTP delivery",
    variables: ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]
  },
  {
    name: "Cloudinary product image storage",
    variables: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
  },
  {
    name: "Razorpay checkout",
    variables: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]
  },
  {
    name: "Razorpay webhooks",
    variables: ["RAZORPAY_WEBHOOK_SECRET"]
  }
];

class EnvironmentConfigurationError extends Error {}

function loadEnvironmentFile(filePath, description) {
  try {
    process.loadEnvFile(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Failed to load the ${description} environment file.`, {
        cause: error
      });
    }
  }
}

function loadNestEnvironment() {
  loadEnvironmentFile(NEST_ENV_FILE, "NestJS");
}

function validateNestEnvironment(environment = process.env, warn = console.warn) {
  if (typeof environment.DATABASE_URL !== "string" || !environment.DATABASE_URL.trim()) {
    throw new EnvironmentConfigurationError("DATABASE_URL is required to start the NestJS API.");
  }
  let databaseUrl;
  try {
    databaseUrl = new URL(environment.DATABASE_URL);
  } catch {
    throw new EnvironmentConfigurationError("DATABASE_URL must be a valid MySQL connection URL.");
  }
  if (databaseUrl.protocol !== "mysql:" || !databaseUrl.hostname || databaseUrl.pathname === "/") {
    throw new EnvironmentConfigurationError(
      "DATABASE_URL must be a valid MySQL connection URL with a database name."
    );
  }
  if (
    typeof environment.CSRF_SECRET !== "string" ||
    Buffer.byteLength(environment.CSRF_SECRET) < 32
  ) {
    throw new EnvironmentConfigurationError(
      "CSRF_SECRET with at least 32 bytes is required to start the NestJS API."
    );
  }
  if (environment.PORT && (
    !Number.isInteger(Number(environment.PORT)) ||
    Number(environment.PORT) < 1 ||
    Number(environment.PORT) > 65535
  )) {
    throw new EnvironmentConfigurationError("PORT must be an integer between 1 and 65535.");
  }

  const warnings = [];
  for (const feature of OPTIONAL_FEATURES) {
    const missing = feature.variables.filter(
      (name) => typeof environment[name] !== "string" || !environment[name].trim()
    );
    if (missing.length) {
      warnings.push(
        `${feature.name} is unavailable until these variables are configured: ${missing.join(", ")}.`
      );
    }
  }

  if (environment.STORE_CURRENCY && !/^[A-Za-z]{3}$/.test(environment.STORE_CURRENCY)) {
    warnings.push("STORE_CURRENCY must be a three-letter currency code; payment requests may fail.");
  }

  for (const message of warnings) warn(`Configuration warning: ${message}`);
  return warnings;
}

module.exports = {
  NEST_ENV_FILE,
  OPTIONAL_FEATURES,
  EnvironmentConfigurationError,
  loadNestEnvironment,
  validateNestEnvironment
};
