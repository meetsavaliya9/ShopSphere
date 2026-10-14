export const CUSTOMER_PERMISSION_GROUPS = [
  {
    title: "Shop & product browsing",
    permissions: [
      ["VIEW_SHOP", "View Shop"],
      ["VIEW_PRODUCT_DETAILS", "View product details", "VIEW_SHOP"],
      ["VIEW_PRODUCT_IMAGES", "View product images", "VIEW_SHOP"],
      ["VIEW_PRODUCT_PRICING", "View product pricing", "VIEW_SHOP"],
      ["SEARCH_PRODUCTS", "Search products", "VIEW_SHOP"],
      ["FILTER_SORT_PRODUCTS", "Filter and sort products", "VIEW_SHOP"],
      ["VIEW_PRODUCT_AVAILABILITY", "View product availability", "VIEW_SHOP"]
    ]
  },
  {
    title: "Wishlist",
    permissions: [
      ["VIEW_WISHLIST", "View Wishlist"],
      ["ADD_TO_WISHLIST", "Add to Wishlist", "VIEW_WISHLIST"],
      ["REMOVE_FROM_WISHLIST", "Remove from Wishlist", "VIEW_WISHLIST"]
    ]
  },
  {
    title: "Cart",
    permissions: [
      ["VIEW_CART", "View Cart"],
      ["ADD_TO_CART", "Add products to Cart", "VIEW_CART"],
      ["UPDATE_CART_QUANTITY", "Update Cart quantity", "VIEW_CART"],
      ["REMOVE_CART_ITEMS", "Remove Cart items", "VIEW_CART"]
    ]
  },
  {
    title: "Checkout & coupons",
    permissions: [
      ["ACCESS_CHECKOUT", "Access Checkout"],
      ["VIEW_COUPON_INPUT", "View coupon input", "ACCESS_CHECKOUT"],
      ["APPLY_COUPON", "Apply coupon", "VIEW_COUPON_INPUT"],
      ["REMOVE_APPLIED_COUPON", "Remove applied coupon", "VIEW_COUPON_INPUT"],
      ["VIEW_DISCOUNT_DETAILS", "View discount details", "ACCESS_CHECKOUT"],
      ["VIEW_ORDER_PRICE_BREAKDOWN", "View order price breakdown", "ACCESS_CHECKOUT"]
    ]
  },
  {
    title: "Orders",
    permissions: [
      ["VIEW_ORDERS", "View Orders"],
      ["VIEW_ORDER_DETAILS", "View order details", "VIEW_ORDERS"],
      ["TRACK_ORDERS", "Track orders", "VIEW_ORDER_DETAILS"],
      ["CANCEL_ORDERS", "Cancel eligible orders", "VIEW_ORDERS"],
      ["BUY_AGAIN", "Buy Again", "VIEW_ORDERS"]
    ]
  },
  {
    title: "Account",
    permissions: [
      ["VIEW_ACCOUNT", "View Account"],
      ["EDIT_PROFILE", "Edit profile", "VIEW_ACCOUNT"],
      ["CHANGE_PASSWORD", "Change password", "VIEW_ACCOUNT"],
      ["VIEW_PAYMENT_HISTORY", "View payment history", "VIEW_ACCOUNT"]
    ]
  }
];

const CUSTOMER_PERMISSION_PARENTS = {
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
};

export function hasCustomerPermission(user, permission) {
  if (user?.role !== "CUSTOMER") return true;
  if (!Array.isArray(user.customerPermissions)) return false;
  const enabled = new Set(user.customerPermissions);
  const isEnabled = (key, checked = new Set()) => {
    if (checked.has(key) || !enabled.has(key)) return false;
    checked.add(key);
    return (CUSTOMER_PERMISSION_PARENTS[key] || []).every((parent) =>
      isEnabled(parent, new Set(checked))
    );
  };
  return isEnabled(permission);
}
