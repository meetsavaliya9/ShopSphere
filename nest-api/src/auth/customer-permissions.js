const { ForbiddenException } = require("@nestjs/common");

const CUSTOMER_PERMISSIONS = Object.freeze([
  "VIEW_SHOP",
  "VIEW_PRODUCT_DETAILS",
  "VIEW_PRODUCT_IMAGES",
  "VIEW_PRODUCT_PRICING",
  "SEARCH_PRODUCTS",
  "FILTER_SORT_PRODUCTS",
  "VIEW_PRODUCT_AVAILABILITY",
  "VIEW_WISHLIST",
  "ADD_TO_WISHLIST",
  "REMOVE_FROM_WISHLIST",
  "VIEW_CART",
  "ADD_TO_CART",
  "UPDATE_CART_QUANTITY",
  "REMOVE_CART_ITEMS",
  "ACCESS_CHECKOUT",
  "VIEW_COUPON_INPUT",
  "APPLY_COUPON",
  "REMOVE_APPLIED_COUPON",
  "VIEW_DISCOUNT_DETAILS",
  "VIEW_ORDER_PRICE_BREAKDOWN",
  "VIEW_ORDERS",
  "VIEW_ORDER_DETAILS",
  "TRACK_ORDERS",
  "CANCEL_ORDERS",
  "BUY_AGAIN",
  "VIEW_ACCOUNT",
  "EDIT_PROFILE",
  "CHANGE_PASSWORD",
  "VIEW_PAYMENT_HISTORY"
]);

const CUSTOMER_PERMISSION_PARENTS = Object.freeze({
  VIEW_PRODUCT_DETAILS: ["VIEW_SHOP"],
  VIEW_PRODUCT_IMAGES: ["VIEW_SHOP"],
  VIEW_PRODUCT_PRICING: ["VIEW_SHOP"],
  SEARCH_PRODUCTS: ["VIEW_SHOP"],
  FILTER_SORT_PRODUCTS: ["VIEW_SHOP"],
  VIEW_PRODUCT_AVAILABILITY: ["VIEW_SHOP"],
  ADD_TO_WISHLIST: ["VIEW_WISHLIST"],
  REMOVE_FROM_WISHLIST: ["VIEW_WISHLIST"],
  ADD_TO_CART: ["VIEW_CART"],
  UPDATE_CART_QUANTITY: ["VIEW_CART"],
  REMOVE_CART_ITEMS: ["VIEW_CART"],
  VIEW_COUPON_INPUT: ["ACCESS_CHECKOUT"],
  APPLY_COUPON: ["ACCESS_CHECKOUT", "VIEW_COUPON_INPUT"],
  REMOVE_APPLIED_COUPON: ["ACCESS_CHECKOUT", "VIEW_COUPON_INPUT"],
  VIEW_DISCOUNT_DETAILS: ["ACCESS_CHECKOUT"],
  VIEW_ORDER_PRICE_BREAKDOWN: ["ACCESS_CHECKOUT"],
  VIEW_ORDER_DETAILS: ["VIEW_ORDERS"],
  TRACK_ORDERS: ["VIEW_ORDER_DETAILS"],
  CANCEL_ORDERS: ["VIEW_ORDERS"],
  BUY_AGAIN: ["VIEW_ORDERS", "VIEW_CART", "ADD_TO_CART"],
  EDIT_PROFILE: ["VIEW_ACCOUNT"],
  CHANGE_PASSWORD: ["VIEW_ACCOUNT"],
  VIEW_PAYMENT_HISTORY: ["VIEW_ACCOUNT"]
});

async function getCustomerPermissions(prisma) {
  const disabled = await prisma.customerpermission.findMany({
    where: { enabled: false },
    select: { permission: true }
  });
  const disabledPermissions = new Set(disabled.map(({ permission }) => permission));
  const isEnabled = (permission, checked = new Set()) => {
    if (checked.has(permission) || disabledPermissions.has(permission)) return false;
    checked.add(permission);
    return (CUSTOMER_PERMISSION_PARENTS[permission] || []).every((parent) =>
      isEnabled(parent, new Set(checked))
    );
  };
  return CUSTOMER_PERMISSIONS.filter((permission) => isEnabled(permission));
}

async function getConfiguredCustomerPermissions(prisma) {
  const rows = await prisma.customerpermission.findMany({
    select: { permission: true, enabled: true }
  });
  const settings = new Map(rows.map(({ permission, enabled }) => [permission, enabled]));
  return CUSTOMER_PERMISSIONS.filter((permission) => settings.get(permission) !== false);
}

async function requireCustomerPermission(prisma, userId, permission) {
  const enabled = new Set(await getCustomerPermissions(prisma));
  if (!enabled.has(permission)) {
    throw new ForbiddenException("This feature is not enabled for customer accounts.");
  }
  return true;
}

module.exports = {
  CUSTOMER_PERMISSIONS,
  CUSTOMER_PERMISSION_PARENTS,
  getCustomerPermissions,
  getConfiguredCustomerPermissions,
  requireCustomerPermission
};
