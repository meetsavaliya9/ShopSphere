const fs = require("node:fs");
const path = require("node:path");
const { BadRequestException } = require("@nestjs/common");

const SETTINGS_DIR = path.resolve(__dirname, "../../data");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "store-settings.json");

const DEFAULT_STORE_SETTINGS = Object.freeze({
  storeName: "ShopSphere",
  storeEmail: "support@shopsphere.com",
  storePhone: "+91 98765 43210",
  storeAddress: "ShopSphere HQ, Mumbai, Maharashtra, India",
  currency: "INR",
  taxRate: 0,
  shippingFee: 0,
  freeShippingThreshold: 500,
  allowCheckout: true,
  maintenanceMode: false,
  announcement: "Welcome to ShopSphere — Premium Curated Commerce"
});

function getStoreSettings() {
  let raw;
  try {
    raw = fs.readFileSync(SETTINGS_FILE, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { ...DEFAULT_STORE_SETTINGS };
    throw new Error(`Failed to read store settings: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The saved store settings file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The saved store settings file must contain an object.");
  }
  return Object.fromEntries(
    Object.keys(DEFAULT_STORE_SETTINGS).map((key) => [
      key,
      parsed[key] === undefined ? DEFAULT_STORE_SETTINGS[key] : parsed[key]
    ])
  );
}

function updateStoreSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestException("A valid store settings object is required.");
  }
  const allowed = new Set([
    "storeName",
    "storeEmail",
    "storePhone",
    "storeAddress",
    "taxRate",
    "shippingFee",
    "freeShippingThreshold",
    "allowCheckout",
    "maintenanceMode",
    "announcement"
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new BadRequestException("The store settings contain unsupported fields.");
  }

  const current = getStoreSettings();
  const updated = { ...current };

  if (input.storeName !== undefined) {
    if (typeof input.storeName !== "string" || !input.storeName.trim() || input.storeName.trim().length > 100) {
      throw new BadRequestException("Store name must be between 1 and 100 characters.");
    }
    updated.storeName = input.storeName.trim();
  }

  if (input.storeEmail !== undefined) {
    const email = String(input.storeEmail).trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new BadRequestException("Store email must be a valid email address.");
    }
    updated.storeEmail = email;
  }

  if (input.storePhone !== undefined) {
    const phone = String(input.storePhone).trim();
    if (phone.length > 30) {
      throw new BadRequestException("Store phone must be at most 30 characters.");
    }
    updated.storePhone = phone;
  }

  if (input.storeAddress !== undefined) {
    const address = String(input.storeAddress).trim();
    if (address.length > 300) {
      throw new BadRequestException("Store address must be at most 300 characters.");
    }
    updated.storeAddress = address;
  }

  if (input.taxRate !== undefined) {
    const tax = Number(input.taxRate);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
      throw new BadRequestException("Tax rate must be a percentage between 0 and 100.");
    }
    updated.taxRate = Math.round(tax * 100) / 100;
  }

  if (input.shippingFee !== undefined) {
    const shipping = Number(input.shippingFee);
    if (!Number.isFinite(shipping) || shipping < 0 || shipping > 100000) {
      throw new BadRequestException("Shipping fee must be a valid amount of at least 0.");
    }
    updated.shippingFee = Math.round(shipping * 100) / 100;
  }

  if (input.freeShippingThreshold !== undefined) {
    const threshold = Number(input.freeShippingThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1000000) {
      throw new BadRequestException("Free shipping threshold must be a valid amount of at least 0.");
    }
    updated.freeShippingThreshold = Math.round(threshold * 100) / 100;
  }

  if (input.allowCheckout !== undefined) {
    if (typeof input.allowCheckout !== "boolean") {
      throw new BadRequestException("allowCheckout must be a boolean.");
    }
    updated.allowCheckout = input.allowCheckout;
  }

  if (input.maintenanceMode !== undefined) {
    if (typeof input.maintenanceMode !== "boolean") {
      throw new BadRequestException("maintenanceMode must be a boolean.");
    }
    updated.maintenanceMode = input.maintenanceMode;
  }

  if (input.announcement !== undefined) {
    const announcement = String(input.announcement || "").trim();
    if (announcement.length > 500) {
      throw new BadRequestException("Announcement must be at most 500 characters.");
    }
    updated.announcement = announcement;
  }

  try {
    if (!fs.existsSync(SETTINGS_DIR)) {
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf8");
  } catch (error) {
    throw new Error(`Failed to persist store settings: ${error.message}`);
  }

  return updated;
}

module.exports = {
  DEFAULT_STORE_SETTINGS,
  getStoreSettings,
  updateStoreSettings
};
