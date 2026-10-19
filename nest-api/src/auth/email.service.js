const { Injectable, ServiceUnavailableException } = require("@nestjs/common");
const sendgrid = require("@sendgrid/mail");

const SENDGRID_REQUEST_TIMEOUT_MS = 15_000;

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
    const from = this.environment.SENDGRID_FROM_EMAIL?.trim() || this.environment.SMTP_FROM?.trim();
    if (!apiKey || !from) {
      throw new ServiceUnavailableException("Email verification is not configured.");
    }

    const startedAt = Date.now();
    console.info("SendGrid OTP delivery started:", { purpose });

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
      console.error("SendGrid OTP delivery failed:", {
        purpose,
        elapsedMs: Date.now() - startedAt,
        name: error?.name || "Error",
        code: typeof error?.code === "string" ? error.code : null,
        statusCode: Number.isInteger(error?.response?.statusCode)
          ? error.response.statusCode
          : null
      });
      throw new ServiceUnavailableException(
        "Email verification could not be delivered.",
        { cause: error }
      );
    }
  }
}

Injectable()(EmailService);

module.exports = {
  EmailService,
  SENDGRID_REQUEST_TIMEOUT_MS
};
