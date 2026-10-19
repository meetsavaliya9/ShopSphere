const {
  EmailService,
  classifySmtpError,
  getSmtpConfig,
  sanitizeSmtpMessage
} = require("../src/auth/email.service");

describe("SMTP configuration", () => {
  const baseEnvironment = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "shopsphere@example.com",
    SMTP_PASSWORD: "abcd efgh ijkl mnop",
    SMTP_LOCAL_ADDRESS: "0.0.0.0",
    SMTP_FROM: "ShopSphere <shopsphere@example.com>"
  };

  it("normalizes Gmail app passwords pasted in four spaced groups", async () => {
    let transportOptions;
    expect(getSmtpConfig(baseEnvironment).auth.pass).toBe("abcdefghijklmnop");
    const sender = new EmailService((options) => {
      transportOptions = options;
      return {
        async verify() { return true; },
        async sendMail() {
          return {
            accepted: ["customer@example.com"],
            rejected: [],
            messageId: "smtp-test-message"
          };
        }
      };
    });
    sender.config = { ...getSmtpConfig(baseEnvironment), from: baseEnvironment.SMTP_FROM };
    await sender.sendCustomerOtp("customer@example.com", "123456", "registration");
    expect(transportOptions).toMatchObject({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
      localAddress: "0.0.0.0",
      auth: { user: "shopsphere@example.com", pass: "abcdefghijklmnop" }
    });
  });

  it("fails delivery when SMTP resolves but rejects the recipient", async () => {
    const sender = new EmailService(() => ({
      async verify() { return true; },
      async sendMail() {
        return {
          accepted: [],
          rejected: ["customer@example.com"],
          messageId: "smtp-rejected-message"
        };
      }
    }));
    sender.config = { ...getSmtpConfig(baseEnvironment), from: baseEnvironment.SMTP_FROM };
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const infoLog = jest.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      sender.sendCustomerOtp("customer@example.com", "123456", "registration")
    ).rejects.toMatchObject({ status: 503 });
    expect(errorLog).toHaveBeenCalledWith(
      "SMTP OTP delivery failed:",
      expect.objectContaining({
        recipient: "[redacted]",
        acceptedCount: 0,
        rejectedCount: 1,
        messageId: "smtp-rejected-message"
      })
    );
    expect(infoLog).toHaveBeenCalledWith(
      "SMTP OTP delivery attempt:",
      expect.objectContaining({ recipient: "[redacted]" })
    );
    errorLog.mockRestore();
    infoLog.mockRestore();
  });

  it("preserves password whitespace for non-Gmail SMTP providers", () => {
    const environment = {
      ...baseEnvironment,
      SMTP_HOST: "mail.example.net",
      SMTP_PASSWORD: "provider password"
    };
    expect(getSmtpConfig(environment).auth.pass).toBe("provider password");
  });

  it("rejects a non-IP SMTP local address", () => {
    expect(() => getSmtpConfig({
      ...baseEnvironment,
      SMTP_LOCAL_ADDRESS: "localhost"
    })).toThrow("Email verification is not configured correctly.");
  });

  it("classifies SMTP authentication, network, TLS, and provider rejections", () => {
    expect(classifySmtpError({ code: "EAUTH", responseCode: 535 })).toBe("authentication");
    expect(classifySmtpError({ code: "ETIMEDOUT" })).toBe("connection");
    expect(classifySmtpError({ code: "ECONNREFUSED" })).toBe("connection");
    expect(classifySmtpError({ code: "ESOCKET" })).toBe("tls");
    expect(classifySmtpError({ responseCode: 550 })).toBe("sender_or_recipient_rejected");
    expect(classifySmtpError({ responseCode: 451 })).toBe("provider_rejected");
  });

  it("surfaces SMTP authentication failures as a safe service error", async () => {
    const sender = new EmailService(() => ({
      async verify() {
        const error = new Error("535-5.7.8 Username and Password not accepted");
        error.code = "EAUTH";
        error.responseCode = 535;
        throw error;
      },
      async sendMail() {
        throw new Error("should not send");
      }
    }));
    sender.config = { ...getSmtpConfig(baseEnvironment), from: baseEnvironment.SMTP_FROM };

    await expect(sender.sendCustomerOtp("customer@example.com", "123456", "registration"))
      .rejects.toMatchObject({ status: 503 });
  });

  it("redacts addresses, one-time codes, and SMTP credentials from diagnostics", () => {
    const config = getSmtpConfig(baseEnvironment);
    const message = sanitizeSmtpMessage(
      new Error("Rejected recipient customer@example.net with password abcdefghijklmnop and code 123456"),
      config
    );

    expect(message).not.toContain("shopsphere@example.com");
    expect(message).not.toContain("abcdefghijklmnop");
    expect(message).not.toContain("123456");
    expect(message).toContain("[email]");
    expect(message).toContain("[code]");
  });
});
