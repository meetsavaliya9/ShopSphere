const {
  EmailService,
  SMTP_TIMEOUT_MS,
  classifySmtpError,
  smtpConfig
} = require("../src/auth/email.service");

describe("SMTP email delivery", () => {
  const environment = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "sender@example.com",
    SMTP_PASSWORD: "abcd efgh ijkl mnop",
    SMTP_FROM: "ShopSphere <sender@example.com>"
  };

  it("configures Gmail STARTTLS and sends the existing OTP message", async () => {
    let transportOptions;
    let message;
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn(async (value) => {
        message = value;
        return {
          accepted: ["private-recipient@example.com"],
          rejected: [],
          messageId: "smtp-test-message"
        };
      }),
      close: jest.fn()
    };
    const infoLog = jest.spyOn(console, "info").mockImplementation(() => {});
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const service = new EmailService((options) => {
      transportOptions = options;
      return transport;
    }, environment);

    await expect(service.sendCustomerOtp(
      "private-recipient@example.com",
      "123456",
      "registration"
    )).resolves.toBeUndefined();

    expect(transportOptions).toMatchObject({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      tls: { rejectUnauthorized: true },
      auth: { user: "sender@example.com", pass: "abcdefghijklmnop" }
    });
    expect(message).toEqual({
      from: "ShopSphere <sender@example.com>",
      to: "private-recipient@example.com",
      subject: "Your ShopSphere verification code",
      text: "Your ShopSphere registration verification code is 123456. It expires in 10 minutes."
    });
    expect(transport.verify).toHaveBeenCalledTimes(1);
    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(service.isConfigured()).toBe(true);

    const logs = JSON.stringify([...infoLog.mock.calls, ...errorLog.mock.calls]);
    expect(logs).not.toContain("abcdefghijklmnop");
    expect(logs).not.toContain("123456");
    expect(logs).not.toContain("private-recipient@example.com");
    expect(logs).not.toContain("sender@example.com");
    infoLog.mockRestore();
    errorLog.mockRestore();
  });

  it.each([
    ["timeout", Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" })],
    ["authentication", Object.assign(new Error("Invalid credentials sender@example.com"), { code: "EAUTH", responseCode: 535 })],
    ["network", Object.assign(new Error("Connection reset"), { code: "ECONNRESET" })],
    ["tls", Object.assign(new Error("TLS negotiation failed"), { code: "ESOCKET" })],
    ["provider", Object.assign(new Error("SMTP rejected recipient"), { responseCode: 550 })]
  ])("classifies SMTP %s failures", (category, error) => {
    expect(classifySmtpError(error)).toBe(category);
  });

  it("logs SMTP authentication failure safely and propagates a service error", async () => {
    const transport = {
      verify: jest.fn().mockRejectedValue(Object.assign(
        new Error("Authentication failed for sender@example.com password=abcdefghijklmnop"),
        { code: "EAUTH", responseCode: 535 }
      )),
      sendMail: jest.fn(),
      close: jest.fn()
    };
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const service = new EmailService(() => transport, environment);

    await expect(service.sendCustomerOtp(
      "private-recipient@example.com",
      "123456",
      "registration"
    )).rejects.toMatchObject({
      status: 503,
      emailFailure: {
        failureType: "authentication",
        stage: "connection",
        code: "EAUTH",
        responseCode: 535
      }
    });

    const logs = JSON.stringify(errorLog.mock.calls);
    expect(logs).not.toContain("abcdefghijklmnop");
    expect(logs).not.toContain("123456");
    expect(logs).not.toContain("private-recipient@example.com");
    expect(logs).not.toContain("sender@example.com");
    expect(logs).toContain("authentication");
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(transport.close).toHaveBeenCalledTimes(1);
    errorLog.mockRestore();
  });

  it("normalizes spaced Gmail App Passwords but preserves non-Gmail passwords", () => {
    expect(smtpConfig(environment).auth.pass).toBe("abcdefghijklmnop");
    expect(smtpConfig({
      ...environment,
      SMTP_HOST: "mail.example.net"
    }).auth.pass).toBe("abcd efgh ijkl mnop");
  });

  it("rejects incomplete or invalid SMTP configuration without echoing credentials", () => {
    expect(() => smtpConfig({
      ...environment,
      SMTP_PORT: "invalid"
    })).toThrow("Email verification is not configured correctly.");
    expect(() => smtpConfig({ SMTP_PASSWORD: "do-not-log-this-password" }))
      .toThrow("Email verification is not configured.");
  });
});
