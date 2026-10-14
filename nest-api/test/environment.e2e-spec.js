const {
  OPTIONAL_FEATURES,
  validateNestEnvironment
} = require("../src/config/environment");

function minimumEnvironment(overrides = {}) {
  return {
    DATABASE_URL: "mysql://user:password@localhost:3306/shopsphere",
    CSRF_SECRET: "a-test-secret-that-is-at-least-32-bytes-long",
    ...overrides
  };
}

describe("NestJS environment validation", () => {
  it("rejects missing or invalid required database/security settings without echoing values", () => {
    expect(() => validateNestEnvironment({ CSRF_SECRET: "safe".repeat(10) }, () => {}))
      .toThrow("DATABASE_URL is required");
    expect(() => validateNestEnvironment(minimumEnvironment({
      DATABASE_URL: "mysql://user:private-password@localhost/"
    }), () => {})).toThrow("DATABASE_URL must be a valid MySQL connection URL");
    expect(() => validateNestEnvironment(minimumEnvironment({
      CSRF_SECRET: "too-short"
    }), () => {})).toThrow("CSRF_SECRET with at least 32 bytes");
    expect(() => validateNestEnvironment(minimumEnvironment({
      PORT: "invalid"
    }), () => {})).toThrow("PORT must be an integer between 1 and 65535");
  });

  it("allows absent optional providers while warning with setting names only", () => {
    const warnings = [];
    const environment = minimumEnvironment({
      SMTP_PASSWORD: "must-not-be-logged",
      RAZORPAY_KEY_SECRET: "also-must-not-be-logged"
    });

    const result = validateNestEnvironment(environment, (warning) => warnings.push(warning));

    expect(result).toHaveLength(OPTIONAL_FEATURES.length);
    expect(warnings).toHaveLength(OPTIONAL_FEATURES.length);
    expect(warnings.join("\n")).toContain("SMTP_HOST");
    expect(warnings.join("\n")).toContain("CLOUDINARY_API_SECRET");
    expect(warnings.join("\n")).toContain("RAZORPAY_WEBHOOK_SECRET");
    expect(warnings.join("\n")).not.toContain("must-not-be-logged");
  });

  it("does not require admin or manager password environment variables", () => {
    const warnings = [];
    expect(validateNestEnvironment(minimumEnvironment({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "mailer-secret",
      SMTP_FROM: "ShopSphere <noreply@example.com>",
      CLOUDINARY_CLOUD_NAME: "cloud",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
      RAZORPAY_KEY_ID: "key-id",
      RAZORPAY_KEY_SECRET: "key-secret",
      RAZORPAY_WEBHOOK_SECRET: "webhook",
      STORE_CURRENCY: "INR"
    }), (warning) => warnings.push(warning))).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
