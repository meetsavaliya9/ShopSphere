require("reflect-metadata");
const {
  bootstrap,
  NestStartupError,
  sanitizeStartupMessage
} = require("./src/main");
const { EnvironmentConfigurationError } = require("./src/config/environment");

bootstrap().catch((error) => {
  if (error instanceof EnvironmentConfigurationError) {
    console.error(`NestJS API configuration error: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (error instanceof NestStartupError) {
    console.error(`NestJS API startup error: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const details = sanitizeStartupMessage(error instanceof Error ? error.message : error);
  console.error(`NestJS API failed to start: ${details}`);
  process.exitCode = 1;
});
