const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function readEnvValue(filePath, key) {
  try {
    const contents = fs.readFileSync(filePath, "utf8");
    const match = contents.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, "m"));
    return match ? match[1].trim() : "";
  } catch (error) {
    return "";
  }
}

function readNestPort() {
  if (process.env.PORT) return Number(process.env.PORT);
  const envPath = path.join(root, "nest-api", ".env");
  let contents;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return 3004;
    console.error("Could not read the NestJS environment file.");
    process.exit(1);
  }
  const match = contents.match(/^\s*PORT\s*=\s*["']?(\d+)/m);
  return match ? Number(match[1]) : 3004;
}

function startMailDevIfNeeded() {
  const envPath = path.join(root, "nest-api", ".env");
  const smtpHost = readEnvValue(envPath, "SMTP_HOST");
  const smtpPort = readEnvValue(envPath, "SMTP_PORT");
  const isLocalSmtp = ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes((smtpHost || "").toLowerCase());

  if (!isLocalSmtp && smtpPort !== "1025") return;
  const command = process.platform === "win32" ? "cmd" : "sh";
  const args = process.platform === "win32"
    ? ["/c", "npx maildev --web 1080 --smtp 1025"]
    : ["-lc", "npx maildev --web 1080 --smtp 1025"];
  start("MailDev", "nest-api", command, args);
}

const apiPort = readNestPort();
const frontendPort = Number(process.env.FRONTEND_PORT || "3000");

if (
  !Number.isInteger(apiPort) ||
  apiPort < 1 ||
  apiPort > 65535 ||
  !Number.isInteger(frontendPort) ||
  frontendPort < 1 ||
  frontendPort > 65535 ||
  frontendPort === apiPort
) {
  console.error("NestJS PORT and FRONTEND_PORT must be valid, distinct ports.");
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
}

function start(name, cwd, command, args, environment = process.env) {
  const child = spawn(command, args, {
    cwd: path.join(root, cwd),
    env: environment,
    stdio: "inherit"
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`${name} could not start: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`${name} stopped unexpectedly (${signal || `exit ${code}`}).`);
      shutdown(code || 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

startMailDevIfNeeded();
start("NestJS API", "nest-api", process.execPath, ["--env-file-if-exists=.env", "index.js"]);
const frontendEnvironment = {
  ...process.env,
  NEST_API_URL: `http://127.0.0.1:${apiPort}/api/v1`
};
start("Next.js frontend", "frontend", process.execPath, [
  "node_modules/next/dist/bin/next",
  "dev",
  "--port",
  String(frontendPort)
], frontendEnvironment);
