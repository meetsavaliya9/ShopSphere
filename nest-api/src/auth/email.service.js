const { Injectable, ServiceUnavailableException } = require("@nestjs/common");
const nodemailer = require("nodemailer");
const { isIP } = require("node:net");

function getSmtpConfig(environment = process.env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = environment;
  if (
    !SMTP_HOST ||
    !Number.isInteger(Number(SMTP_PORT)) ||
    Number(SMTP_PORT) < 1 ||
    Number(SMTP_PORT) > 65535 ||
    !SMTP_USER ||
    !SMTP_PASSWORD ||
    !SMTP_FROM
  ) {
    throw new ServiceUnavailableException("Email verification is not configured correctly.");
  }
  const rawLocalAddress = environment.SMTP_LOCAL_ADDRESS ? String(environment.SMTP_LOCAL_ADDRESS).trim() : "";
  if (rawLocalAddress && !isIP(rawLocalAddress)) {
    throw new ServiceUnavailableException("Email verification is not configured correctly.");
  }

  const password = SMTP_HOST.toLowerCase() === "smtp.gmail.com"
    ? SMTP_PASSWORD.replace(/\s/g, "")
    : SMTP_PASSWORD;
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(environment.SMTP_SECURE).toLowerCase() === "true",
    ...(rawLocalAddress ? { localAddress: rawLocalAddress } : {}),
    auth: { user: SMTP_USER, pass: password },
    from: SMTP_FROM
  };
}

function classifySmtpError(error) {
  if (error?.code === "EAUTH" || error?.responseCode === 535) return "authentication";
  if (["ECONNREFUSED", "ECONNECTION", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"].includes(error?.code)) {
    return "connection";
  }
  if (error?.code === "ESOCKET") return "tls";
  if (error?.responseCode >= 500) return "sender_or_recipient_rejected";
  return "provider_rejected";
}

function sanitizeSmtpMessage(error, config) {
  return String(error?.message || "Email delivery failed.")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{6}\b/g, "[code]")
    .replaceAll(config?.auth?.pass || "\0", "[credential]")
    .replaceAll(config?.auth?.user || "\0", "[email]");
}

class EmailService {
  constructor(transportFactory = nodemailer.createTransport) {
    this.transport = null;
    this.config = null;
    this.transportFactory = transportFactory;
  }

  isConfigured() {
    try {
      this.config = getSmtpConfig();
      return true;
    } catch {
      return false;
    }
  }

  async sendCustomerOtp(email, code, purpose) {
    if (!this.config && !this.isConfigured()) {
      throw new ServiceUnavailableException("Email verification is not configured.");
    }
    if (!this.transport) {
      const { from, ...transportConfig } = this.config;
      this.transport = this.transportFactory(transportConfig);
    }

    console.info("SMTP OTP delivery attempt:", {
      host: this.config.host,
      port: this.config.port,
      recipient: "[redacted]"
    });

    try {
      const result = await this.transport.sendMail({
        from: this.config.from,
        to: email,
        subject: "Your ShopSphere verification code",
        text: `Your ShopSphere ${purpose} verification code is ${code}. It expires in 10 minutes.`
      });
      const acceptedCount = Array.isArray(result?.accepted) ? result.accepted.length : 0;
      const rejectedCount = Array.isArray(result?.rejected) ? result.rejected.length : 0;
      if (acceptedCount === 0) {
        const error = new Error("The SMTP server did not accept the recipient.");
        error.code = "ERECIPIENT";
        error.acceptedCount = acceptedCount;
        error.rejectedCount = rejectedCount;
        error.messageId = result?.messageId;
        throw error;
      }
      console.info("SMTP OTP delivery accepted:", {
        host: this.config.host,
        port: this.config.port,
        recipient: "[redacted]",
        acceptedCount,
        rejectedCount,
        messageId: result.messageId || null
      });
    } catch (error) {
      const category = classifySmtpError(error);
      const message = sanitizeSmtpMessage(error, this.config);
      console.error("SMTP OTP delivery failed:", {
        host: this.config.host,
        port: this.config.port,
        recipient: "[redacted]",
        category,
        code: error?.code || null,
        responseCode: error?.responseCode || null,
        acceptedCount: error?.acceptedCount || 0,
        rejectedCount: error?.rejectedCount || 0,
        messageId: error?.messageId || null,
        message
      });
      throw new ServiceUnavailableException(
        `Email verification could not be delivered (${category}): ${message}`,
        { cause: error }
      );
    }
  }
}

Injectable()(EmailService);

module.exports = {
  EmailService,
  classifySmtpError,
  getSmtpConfig,
  sanitizeSmtpMessage
};
