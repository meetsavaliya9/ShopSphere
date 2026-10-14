const fs = require("node:fs");
const {
  getStoreSettings,
  updateStoreSettings
} = require("../src/admin/store-settings");

describe("persisted store settings", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses defaults only when the settings file does not exist", () => {
    jest.spyOn(fs, "readFileSync").mockImplementation(() => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    });

    expect(getStoreSettings()).toMatchObject({
      storeName: "ShopSphere",
      allowCheckout: true,
      currency: "INR"
    });
  });

  it("surfaces a corrupt saved settings file instead of silently replacing its values", () => {
    jest.spyOn(fs, "readFileSync").mockReturnValue("{invalid");

    expect(() => getStoreSettings()).toThrow("The saved store settings file is not valid JSON.");
  });

  it("does not propagate unrecognized fields from the settings file", () => {
    jest.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({
      storeName: "ShopSphere",
      privateCredential: "must-not-leak"
    }));

    const settings = getStoreSettings();
    expect(settings.storeName).toBe("ShopSphere");
    expect(settings).not.toHaveProperty("privateCredential");
  });

  it("validates, persists, and reloads supported website settings", () => {
    let persisted = JSON.stringify({
      storeName: "Old name",
      storeEmail: "old@example.test",
      allowCheckout: true
    });
    jest.spyOn(fs, "readFileSync").mockImplementation(() => persisted);
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const write = jest.spyOn(fs, "writeFileSync").mockImplementation((file, content) => {
      persisted = content;
    });

    const result = updateStoreSettings({
      storeName: "New name",
      storeEmail: "support@example.test",
      announcement: "A real customer-facing notice",
      allowCheckout: false
    });

    expect(result).toMatchObject({
      storeName: "New name",
      storeEmail: "support@example.test",
      announcement: "A real customer-facing notice",
      allowCheckout: false
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][1])).toMatchObject({
      storeName: "New name",
      allowCheckout: false
    });
    expect(getStoreSettings()).toMatchObject({
      storeName: "New name",
      storeEmail: "support@example.test",
      announcement: "A real customer-facing notice",
      allowCheckout: false
    });
  });

  it("rejects unsupported fields without touching persisted settings", () => {
    const write = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    expect(() => updateStoreSettings({ privateKey: "not-allowed" }))
      .toThrow("The store settings contain unsupported fields.");
    expect(write).not.toHaveBeenCalled();
  });
});
