const { Injectable, ServiceUnavailableException } = require("@nestjs/common");
const sendgrid = require("@sendgrid/mail");

const SENDGRID_REQUEST_TIMEOUT_MS = 15_000;

function safeProviderMessage(message, apiKey) {
  return String(message || "SendGrid request failed.")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{6}\b/g, "[code]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(password|token|secret|authorization|api[_ -]?key)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
    .replace(/\bSG\.[A-Za-z0-9_-]{12,}/g, "[api-key]")
    .replaceAll(apiKey || "\0", "[api-key]")
    .slice(0, 500);
}

function sendGridFailureDetails(error, apiKey) {
  const response = error?.response;
  const responseBody = response?.body;
  const providerErrors = Array.isArray(responseBody?.errors) ? responseBody.errors : [];
  const statusCode = Number.isInteger(response?.statusCode)
    ? response.statusCode
    : Number.isInteger(error?.code)
      ? error.code
      : null;
  const providerError = providerErrors.find((entry) => entry && typeof entry === "object") || {};
  const providerMessage = providerErrors
    .map((entry) => typeof entry?.message === "string" ? entry.message : "")
    .filter(Boolean)
    .join("; ");
  const safeMessage = safeProviderMessage(providerMessage || error?.message, apiKey);
  const message = safeMessage.toLowerCase();
  const errorCode = typeof error?.code === "string" ? error.code : null;
  let failureType = "provider";

  if (
    errorCode === "ETIMEDOUT" ||
    errorCode === "ECONNABORTED" ||
    /timed? ?out|timeout/.test(message)
  ) {
    failureType = "timeout";
  } else if (!statusCode && errorCode) {
    failureType = "network";
  } else if (/sender|verified identity|from address/.test(message)) {
    failureType = "sender_verification";
  } else if (statusCode === 401) {
    failureType = "authentication";
  } else if (statusCode === 403) {
    failureType = "permission";
  }

  return {
    failureType,
    statusCode,
    providerCode: typeof providerError.code === "string" || typeof providerError.code === "number"
      ? providerError.code
      : null,
    providerField: typeof providerError.field === "string" ? providerError.field : null,
    code: errorCode,
    message: safeMessage
  };
}

function emailServiceUnavailable(failure) {
  const error = new ServiceUnavailableException(
    failure.failureType === "configuration"
      ? "Email verification is not configured."
      : "Email verification could not be delivered.",
    { cause: failure.cause }
  );
  error.emailFailure = {
    failureType: failure.failureType,
    statusCode: failure.statusCode ?? null,
    providerCode: failure.providerCode ?? null,
    providerField: failure.providerField ?? null,
    code: failure.code ?? null,
    message: failure.message
  };
  return error;
}

class EmailService {
  constructor(mailClient = sendgrid, environment = process.env) {
    this.mailClient = mailClient;
    this.environment = environment;
  }

  isConfigured() {
    return Boolean(
      this.environment.SENDGRID_API_KEY?.trim() &&
      (this.environment.SENDGRID_FROM_EMAIL?.trim() || this.environment.SMTP_FROM?.trim())
    );
  }

  async sendCustomerOtp(email, code, purpose) {
    const apiKey = this.environment.SENDGRID_API_KEY?.trim();
    const sendGridFrom = this.environment.SENDGRID_FROM_EMAIL?.trim();
    const legacyFrom = this.environment.SMTP_FROM?.trim();
    const from = sendGridFrom || legacyFrom;
    const fromVariable = sendGridFrom ? "SENDGRID_FROM_EMAIL" : "SMTP_FROM";
    if (!apiKey || !from) {
      const missing = [];
      if (!apiKey) missing.push("SENDGRID_API_KEY");
      if (!from) missing.push("SENDGRID_FROM_EMAIL");
      const failure = {
        failureType: "configuration",
        message: `Missing required setting${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`
      };
      console.error("SendGrid OTP configuration failed:", failure);
      throw emailServiceUnavailable(failure);
    }

    const startedAt = Date.now();
    console.info("SendGrid OTP delivery started:", { purpose, fromVariable });

    try {
      this.mailClient.setApiKey(apiKey);
      this.mailClient.setTimeout(SENDGRID_REQUEST_TIMEOUT_MS);
      const [response] = await this.mailClient.send({
        from,
        to: email,
        subject: "Your ShopSphere verification code",
        text: `Your ShopSphere ${purpose} verification code is ${code}. It expires in 10 minutes.`
      });
      console.info("SendGrid OTP delivery succeeded:", {
        purpose,
        elapsedMs: Date.now() - startedAt,
        statusCode: response?.statusCode || null
      });
    } catch (error) {
      const failure = sendGridFailureDetails(error, apiKey);
      console.error("SendGrid OTP delivery failed:", {
        purpose,
        elapsedMs: Date.now() - startedAt,
        name: error?.name || "Error",
        ...failure
      });
      throw emailServiceUnavailable({ ...failure, cause: error });
    }
  }
}

Injectable()(EmailService);

module.exports = {
  EmailService,
  SENDGRID_REQUEST_TIMEOUT_MS,
  safeProviderMessage,
  sendGridFailureDetails
};
