const { Injectable, ServiceUnavailableException } = require("@nestjs/common");
const nodemailer = require("nodemailer");

const SMTP_TIMEOUT_MS = 15_000;

function senderDomain(sender) {
  if (typeof sender !== "string" || !sender.trim()) return null;
  const trimmed = sender.trim();
  const bracketedAddress = trimmed.match(/<\s*([^<>]+)\s*>/);
  const address = (bracketedAddress?.[1] || trimmed).trim().toLowerCase();
  const separator = address.lastIndexOf("@");
  if (separator < 1) return null;
  const domain = address.slice(separator + 1);
  return /^[a-z0-9.-]+$/.test(domain) ? domain : null;
}

function smtpConfig(environment = process.env) {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"];
  const missing = required.filter((name) => !String(environment[name] ?? "").trim());
  if (missing.length) {
    const error = new ServiceUnavailableException("Email verification is not configured.");
    error.emailFailure = {
      failureType: "configuration",
      code: null,
      responseCode: null,
      message: `Missing required settings: ${missing.join(", ")}.`
    };
    throw error;
  }

  const port = Number(environment.SMTP_PORT);
  const secureValue = environment.SMTP_SECURE.trim().toLowerCase();
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !["true", "false"].includes(secureValue)) {
    const error = new ServiceUnavailableException("Email verification is not configured correctly.");
    error.emailFailure = {
      failureType: "configuration",
      code: null,
      responseCode: null,
      message: "SMTP_PORT must be a valid port and SMTP_SECURE must be true or false."
    };
    throw error;
  }

  const secure = secureValue === "true";
  const password = environment.SMTP_HOST.trim().toLowerCase() === "smtp.gmail.com"
    ? environment.SMTP_PASSWORD.replace(/\s/g, "")
    : environment.SMTP_PASSWORD;
  return {
    host: environment.SMTP_HOST.trim(),
    port,
    secure,
    requireTLS: !secure,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    tls: { rejectUnauthorized: true },
    auth: { user: environment.SMTP_USER.trim(), pass: password },
    from: environment.SMTP_FROM.trim()
  };
}

function classifySmtpError(error) {
  if (error?.code === "EAUTH" || error?.responseCode === 535) return "authentication";
  if (error?.code === "ETIMEDOUT" || error?.code === "ECONNABORTED") return "timeout";
  if (["ECONNECTION", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(error?.code)) {
    return "network";
  }
  if (error?.code === "ESOCKET") return "tls";
  if (error?.responseCode >= 400) return "provider";
  return "delivery";
}

function safeSmtpMessage(message, config) {
  return String(message || "SMTP email delivery failed.")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{6}\b/g, "[code]")
    .replace(/\b(password|token|secret|authorization|api[_ -]?key)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
    .replaceAll(config?.auth?.pass || "\0", "[credential]")
    .replaceAll(config?.auth?.user || "\0", "[email]")
    .slice(0, 500);
}

function smtpFailureDetails(error, config, stage) {
  return {
    failureType: classifySmtpError(error),
    stage,
    code: typeof error?.code === "string" ? error.code : null,
    responseCode: Number.isInteger(error?.responseCode) ? error.responseCode : null,
    message: safeSmtpMessage(error?.message, config)
  };
}

class EmailService {
  constructor(transportFactory = nodemailer.createTransport, environment = process.env) {
    this.transportFactory = transportFactory;
    this.environment = environment;
    const sender = environment.SMTP_FROM?.trim();
    console.info("SMTP sender configuration:", {
      senderConfigured: Boolean(sender),
      senderDomain: senderDomain(sender),
      hostConfigured: Boolean(environment.SMTP_HOST?.trim()),
      portConfigured: Boolean(environment.SMTP_PORT?.trim())
    });
  }

  isConfigured() {
    try {
      smtpConfig(this.environment);
      return true;
    } catch {
      return false;
    }
  }

  async sendCustomerOtp(email, code, purpose) {
    let config;
    try {
      config = smtpConfig(this.environment);
    } catch (error) {
      console.error("SMTP OTP configuration failed:", error.emailFailure || {
        failureType: "configuration",
        message: "SMTP configuration is invalid."
      });
      throw error;
    }

    const startedAt = Date.now();
    let transport;
    let stage = "connection";
    console.info("SMTP OTP delivery started:", {
      host: config.host,
      port: config.port,
      purpose,
      recipient: "[redacted]",
      timeoutMs: SMTP_TIMEOUT_MS
    });

    try {
      transport = this.transportFactory({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: config.requireTLS,
        connectionTimeout: config.connectionTimeout,
        greetingTimeout: config.greetingTimeout,
        socketTimeout: config.socketTimeout,
        tls: config.tls,
        auth: config.auth
      });
      if (typeof transport.verify === "function") {
        await transport.verify();
        console.info("SMTP connection and authentication verified:", {
          host: config.host,
          port: config.port,
          purpose,
          elapsedMs: Date.now() - startedAt
        });
      }

      stage = "sendMail";
      const result = await transport.sendMail({
        from: config.from,
        to: email,
        subject: "Your ShopSphere verification code",
        text: `Your ShopSphere ${purpose} verification code is ${code}. It expires in 10 minutes.`
      });
      const acceptedCount = Array.isArray(result?.accepted) ? result.accepted.length : 0;
      const rejectedCount = Array.isArray(result?.rejected) ? result.rejected.length : 0;
      if (acceptedCount === 0) {
        const error = new Error("SMTP server did not accept the recipient.");
        error.code = "ERECIPIENT";
        error.acceptedCount = acceptedCount;
        error.rejectedCount = rejectedCount;
        throw error;
      }
      console.info("SMTP OTP delivery succeeded:", {
        host: config.host,
        port: config.port,
        purpose,
        elapsedMs: Date.now() - startedAt,
        recipient: "[redacted]",
        acceptedCount,
        rejectedCount,
        messageId: result.messageId || null
      });
    } catch (error) {
      const failure = smtpFailureDetails(error, config, stage);
      console.error("SMTP OTP delivery failed:", {
        host: config.host,
        port: config.port,
        purpose,
        recipient: "[redacted]",
        elapsedMs: Date.now() - startedAt,
        name: error?.name || "Error",
        ...failure,
        acceptedCount: error?.acceptedCount || 0,
        rejectedCount: error?.rejectedCount || 0
      });
      const serviceError = new ServiceUnavailableException(
        "The verification email could not be sent. Please try again later.",
        { cause: error }
      );
      serviceError.emailFailure = failure;
      throw serviceError;
    } finally {
      if (typeof transport?.close === "function") transport.close();
    }
  }
}

Injectable()(EmailService);

module.exports = {
  EmailService,
  SMTP_TIMEOUT_MS,
  classifySmtpError,
  safeSmtpMessage,
  smtpConfig,
  smtpFailureDetails
};
