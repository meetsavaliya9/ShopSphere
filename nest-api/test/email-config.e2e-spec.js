const {
  EmailService,
  SENDGRID_REQUEST_TIMEOUT_MS,
  sendGridFailureDetails
} = require("../src/auth/email.service");

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

  it("reports missing SendGrid settings as configuration failure without calling the SDK", async () => {
    const mailClient = {
      setApiKey: jest.fn(),
      setTimeout: jest.fn(),
      send: jest.fn()
    };
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const service = new EmailService(mailClient, {});

    await expect(service.sendCustomerOtp(
      "private-recipient@example.com",
      "123456",
      "registration"
    )).rejects.toMatchObject({
      status: 503,
      emailFailure: {
        failureType: "configuration",
        message: "Missing required settings: SENDGRID_API_KEY, SENDGRID_FROM_EMAIL."
      }
    });

    expect(mailClient.setApiKey).not.toHaveBeenCalled();
    expect(mailClient.send).not.toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private-recipient@example.com");
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
    expect(logs).toContain("Rejected [email]");
    errorLog.mockRestore();
  });

  it("extracts a sanitized sender-verification error from the official SDK response shape", async () => {
    const mailClient = {
      setApiKey: jest.fn(),
      setTimeout: jest.fn(),
      send: jest.fn().mockRejectedValue(Object.assign(new Error("Forbidden"), {
        code: 403,
        response: {
          body: {
            errors: [{
              message: "The from address private-sender@example.com is not a verified Sender Identity.",
              code: "sender_not_verified",
              field: "from",
              help: "Verify private-sender@example.com in SendGrid."
            }]
          }
        }
      }))
    };
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const service = new EmailService(mailClient, environment);

    await expect(service.sendCustomerOtp(
      "private-recipient@example.com",
      "123456",
      "registration"
    )).rejects.toMatchObject({
      status: 503,
      emailFailure: {
        failureType: "sender_verification",
        statusCode: 403,
        providerCode: "sender_not_verified",
        providerField: "from",
        message: "The from address [email] is not a verified Sender Identity."
      }
    });

    const diagnostic = JSON.stringify(errorLog.mock.calls);
    expect(diagnostic).toContain("sender_verification");
    expect(diagnostic).toContain("403");
    expect(diagnostic).toContain("not a verified Sender Identity");
    expect(diagnostic).toContain("sender_not_verified");
    expect(diagnostic).not.toContain("private-sender@example.com");
    expect(diagnostic).not.toContain("private-recipient@example.com");
    expect(diagnostic).not.toContain("Verify private-sender");
    errorLog.mockRestore();
  });

  it.each([
    ["permission", Object.assign(new Error("Forbidden"), { code: 403 })],
    ["authentication", Object.assign(new Error("Unauthorized"), { code: 401 })],
    ["network", Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })],
    ["timeout", Object.assign(new Error("timeout of 15000ms exceeded"), { code: "ETIMEDOUT" })],
    ["provider", Object.assign(new Error("Bad Gateway"), { code: 502 })]
  ])("classifies SendGrid %s failures", (failureType, error) => {
    expect(sendGridFailureDetails(error, environment.SENDGRID_API_KEY).failureType).toBe(failureType);
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