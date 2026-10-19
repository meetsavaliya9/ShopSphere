const { EmailService, SENDGRID_REQUEST_TIMEOUT_MS } = require("../src/auth/email.service");

describe("SendGrid email delivery", () => {
  const environment = {
    SENDGRID_API_KEY: "SG.test-sendgrid-key",
    SENDGRID_FROM_EMAIL: "verified-sender@example.com"
  };

  it("sends OTP email through SendGrid and keeps secrets out of logs", async () => {
    const mailClient = {
      setApiKey: jest.fn(),
      setTimeout: jest.fn(),
      send: jest.fn().mockResolvedValue([{ statusCode: 202 }, {}])
    };
    const infoLog = jest.spyOn(console, "info").mockImplementation(() => {});
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const service = new EmailService(mailClient, environment);

    await expect(service.sendCustomerOtp(
      "private-recipient@example.com",
      "123456",
      "registration"
    )).resolves.toBeUndefined();

    expect(mailClient.setApiKey).toHaveBeenCalledWith("SG.test-sendgrid-key");
    expect(mailClient.setTimeout).toHaveBeenCalledWith(SENDGRID_REQUEST_TIMEOUT_MS);
    expect(mailClient.send).toHaveBeenCalledWith({
      from: "verified-sender@example.com",
      to: "private-recipient@example.com",
      subject: "Your ShopSphere verification code",
      text: "Your ShopSphere registration verification code is 123456. It expires in 10 minutes."
    });
    expect(service.isConfigured()).toBe(true);
    const logs = JSON.stringify([...infoLog.mock.calls, ...errorLog.mock.calls]);
    expect(logs).not.toContain("SG.test-sendgrid-key");
    expect(logs).not.toContain("123456");
    expect(logs).not.toContain("private-recipient@example.com");

    infoLog.mockRestore();
    errorLog.mockRestore();
  });

  it("maps SendGrid API failures to a safe service error without logging provider details", async () => {
    const mailClient = {
      setApiKey: jest.fn(),
      setTimeout: jest.fn(),
      send: jest.fn().mockRejectedValue(Object.assign(
        new Error("Rejected private-recipient@example.com with key SG.test-sendgrid-key and code 123456"),
        { code: "ECONNRESET", response: { statusCode: 500 } }
      ))
    };
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const service = new EmailService(mailClient, environment);

    await expect(service.sendCustomerOtp(
      "private-recipient@example.com",
      "123456",
      "registration"
    )).rejects.toMatchObject({
      status: 503,
      message: "Email verification could not be delivered."
    });

    const logs = JSON.stringify(errorLog.mock.calls);
    expect(logs).not.toContain("SG.test-sendgrid-key");
    expect(logs).not.toContain("123456");
    expect(logs).not.toContain("private-recipient@example.com");
    expect(logs).not.toContain("Rejected");
    errorLog.mockRestore();
  });

  it("accepts SMTP_FROM as a compatibility fallback for the verified sender", async () => {
    const mailClient = {
      setApiKey: jest.fn(),
      setTimeout: jest.fn(),
      send: jest.fn().mockResolvedValue([{ statusCode: 202 }, {}])
    };
    const service = new EmailService(mailClient, {
      SENDGRID_API_KEY: "SG.test-sendgrid-key",
      SMTP_FROM: "ShopSphere <verified-sender@example.com>"
    });

    expect(service.isConfigured()).toBe(true);
    await service.sendCustomerOtp("recipient@example.com", "654321", "login");
    expect(mailClient.send).toHaveBeenCalledWith(expect.objectContaining({
      from: "ShopSphere <verified-sender@example.com>"
    }));
  });
});