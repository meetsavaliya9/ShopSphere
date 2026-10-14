const { ForbiddenException, BadRequestException } = require("@nestjs/common");
const {
  OrderService: NestOrderService,
  normalizeAddress,
  orderView
} = require("../src/orders/order.service");

class OrderService extends NestOrderService {
  constructor({ client }) {
    super({
      client: {
        ...client,
        customerpermission: client.customerpermission || {
          async findMany() {
            return [];
          }
        }
      }
    });
  }
}

const address = {
  fullName: "Test Customer",
  phone: "+91 9876543210",
  addressLine1: "1 Market Street",
  addressLine2: "",
  city: "Mumbai",
  state: "Maharashtra",
  postalCode: "400001",
  country: "IN"
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function stockMocks(products) {
  const rows = new Map(products.map((product) => [product.id, { ...product }]));
  const history = [];
  return {
    history,
    getProduct(id) {
      return rows.get(id);
    },
    product: {
      async findUnique({ where }) {
        const product = rows.get(where.id);
        return product ? { ...product } : null;
      },
      async updateMany({ where, data }) {
        const product = rows.get(where.id);
        if (
          !product ||
          product.stockQuantity !== where.stockQuantity ||
          product.inStock !== where.inStock ||
          product.lowStockThreshold !== where.lowStockThreshold
        ) {
          return { count: 0 };
        }
        Object.assign(product, data);
        return { count: 1 };
      }
    },
    inventorystockhistory: {
      async create({ data }) {
        history.push(data);
      }
    }
  };
}

describe("NestJS orders and payment service", () => {
  const previousEnvironment = {};
  let originalFetch;

  beforeEach(() => {
    for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "STORE_CURRENCY", "GST_RATE_PERCENT"]) {
      previousEnvironment[key] = process.env[key];
    }
    process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
    process.env.RAZORPAY_KEY_SECRET = "unit-test-secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "unit-test-webhook-secret";
    process.env.STORE_CURRENCY = "INR";
    process.env.GST_RATE_PERCENT = "18";
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("validates delivery data and serializes only safe order fields", () => {
    expect(normalizeAddress(address)).toEqual(address);
    expect(() => normalizeAddress({ ...address, country: "India" })).toThrow(BadRequestException);
    expect(() => normalizeAddress({ ...address, password: "must-not-be-accepted" })).toThrow(BadRequestException);

    const result = orderView({
      id: 9,
      status: "PAYMENT_PENDING",
      totalAmount: "25.00",
      shippingAddress: JSON.stringify(address),
      orderitem: [{
        id: 1,
        productId: 2,
        productName: "Item",
        unitPrice: "12.50",
        quantity: 2,
        product: { imageUrl: "https://images.example/item.jpg" }
      }],
      payment: {
        status: "PENDING",
        razorpayOrderId: "order_test",
        razorpayPaymentId: null,
        amount: "25.00",
        currency: "INR",
        createdAt: new Date(),
        updatedAt: new Date(),
        failureCode: "INTERNAL_ONLY"
      },
      userId: 3
    });
    expect(result).toMatchObject({
      id: 9,
      totalAmount: 25,
      invoiceNumber: "SS-000009",
      shippingAddress: address,
      pricingBreakdown: null,
      items: [{ productId: 2, imageUrl: "https://images.example/item.jpg", lineTotal: 25 }],
      payment: { status: "PENDING", razorpayOrderId: "order_test" }
    });
    expect(result.payment).not.toHaveProperty("failureCode");
    expect(result).not.toHaveProperty("password");
  });

  it("reserves a coupon and uses its server-calculated total for the saved order and payment", async () => {
    let savedOrder;
    let savedPayment;
    let savedItems;
    let couponReservation;
    const inventory = stockMocks([{
      id: 2,
      name: "Product",
      inStock: true,
      stockQuantity: 10,
      lowStockThreshold: 5,
      lowStockAlertActive: false,
      lowStockAlertAt: null
    }]);
    const client = {
      ...inventory,
      order: {
        async findUnique() {
          return null;
        },
        async create({ data }) {
          savedItems = data.orderitem.create;
          savedOrder = { ...data, id: 41 };
          savedOrder.orderitem = data.orderitem.create.map((item, index) => ({
            ...item,
            id: index + 1
          }));
          return savedOrder;
        }
      },
      payment: {
        async create({ data }) {
          savedPayment = { ...data, id: 7, razorpayOrderId: null };
          return savedPayment;
        },
        async findUnique() {
          return savedPayment;
        },
        async update({ data }) {
          Object.assign(savedPayment, data);
          return savedPayment;
        }
      },
      cart: {
        async findUnique() {
          return {
            cartitem: [{
              quantity: 2,
              product: {
                id: 2,
                name: "Product",
                price: "12.50",
                inStock: true,
                stockQuantity: 10
              }
            }]
          };
        }
      },
      coupon: {
        async findUnique() {
          return {
            id: 4,
            code: "SPRING10",
            discount: 10,
            discountType: "PERCENTAGE",
            minSpend: "0.00",
            isActive: true,
            startsAt: null,
            expiresAt: null,
            usageLimit: 5,
            usageCount: 2
          };
        },
        async updateMany(args) {
          couponReservation = args;
          return { count: 1 };
        }
      },
      async $transaction(callback) {
        return callback(client);
      }
    };
    global.fetch.mockResolvedValue(jsonResponse({
      id: "order_test_41",
      amount: 2655,
      currency: "INR"
    }, 200));

    const service = new OrderService({ client });
    const result = await service.createCheckout(3, address, "checkout-idempotency-key", "spring10");

    expect(savedOrder.totalAmount).toBe(26.55);
    const savedBreakdown = JSON.parse(savedOrder.shippingAddress).pricingBreakdown;
    expect(savedBreakdown).toEqual({
      subtotal: 25,
      discount: 2.5,
      shipping: 0,
      tax: 4.05,
      taxRatePercent: 18,
      total: 26.55,
      currency: "INR",
      couponCode: "SPRING10",
      couponDiscountType: "PERCENTAGE"
    });
    expect(orderView(savedOrder).pricingBreakdown).toEqual(savedBreakdown);
    expect(savedItems).toEqual([{
      productId: 2,
      productName: "Product",
      unitPrice: 12.5,
      quantity: 2
    }]);
    expect(couponReservation.where).toMatchObject({
      id: 4,
      isActive: true,
      usageCount: { lt: 5 }
    });
    expect(couponReservation.data.usageCount).toEqual({ increment: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(inventory.history).toHaveLength(1);
    expect(inventory.history[0]).toMatchObject({
      previousQuantity: 10,
      newQuantity: 8,
      quantityChange: -2,
      actionType: "SALE",
      reason: "Order #41 stock reserved at checkout",
      userId: 3
    });
    expect(global.fetch.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/orders");
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      amount: 2655,
      currency: "INR"
    });
    expect(result).toEqual({
      publicKey: "rzp_test_unit",
      razorpayOrder: { id: "order_test_41", amount: 2655, currency: "INR" },
      order: {
        id: 41,
        totalAmount: 26.55,
        currency: "INR",
        pricingBreakdown: {
          subtotal: 25,
          discount: 2.5,
          shipping: 0,
          tax: 4.05,
          taxRatePercent: 18,
          total: 26.55,
          currency: "INR",
          couponCode: "SPRING10",
          couponDiscountType: "PERCENTAGE"
        }
      }
    });
  });

  it("starts normal payment for checkout without a coupon", async () => {
    let savedOrder;
    let savedPayment;
    const inventory = stockMocks([{
      id: 2,
      name: "Product",
      inStock: true,
      stockQuantity: 10,
      lowStockThreshold: null,
      lowStockAlertActive: false,
      lowStockAlertAt: null
    }]);
    const client = {
      ...inventory,
      order: {
        async findUnique() {
          return null;
        },
        async create({ data }) {
          savedOrder = {
            ...data,
            id: 43,
            orderitem: data.orderitem.create.map((item, index) => ({ ...item, id: index + 1 }))
          };
          return savedOrder;
        }
      },
      payment: {
        async create({ data }) {
          savedPayment = { ...data, razorpayOrderId: null };
          return savedPayment;
        },
        async findUnique() {
          return savedPayment;
        },
        async update({ data }) {
          Object.assign(savedPayment, data);
          return savedPayment;
        }
      },
      cart: {
        async findUnique() {
          return {
            cartitem: [{
              quantity: 2,
              product: { id: 2, name: "Product", price: "12.50", inStock: true, stockQuantity: 10 }
            }]
          };
        }
      },
      async $transaction(callback) {
        return callback(client);
      }
    };
    global.fetch.mockResolvedValue(jsonResponse({
      id: "order_test_43",
      amount: 2950,
      currency: "INR"
    }));

    const result = await new OrderService({ client }).createCheckout(
      3,
      address,
      "checkout-without-coupon"
    );

    expect(savedOrder.totalAmount).toBe(29.5);
    expect(JSON.parse(savedOrder.shippingAddress).pricingBreakdown).toMatchObject({
      subtotal: 25,
      discount: 0,
      tax: 4.5,
      total: 29.5
    });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      amount: 2950,
      currency: "INR"
    });
    expect(result.razorpayOrder).toEqual({
      id: "order_test_43",
      amount: 2950,
      currency: "INR"
    });
  });

  it("quotes trusted cart prices with configurable GST and no invented fees", async () => {
    const client = {
      cart: {
        async findUnique() {
          return {
            cartitem: [{
              quantity: 3,
              product: { id: 5, name: "Bottle", price: "150.00", inStock: true, stockQuantity: 10 }
            }]
          };
        }
      }
    };

    const service = new OrderService({ client });
    await expect(service.getQuote(8)).resolves.toEqual({
      subtotal: 450,
      discount: 0,
      shipping: 0,
      tax: 81,
      taxRatePercent: 18,
      total: 531,
      currency: "INR"
    });
    process.env.GST_RATE_PERCENT = "5";
    await expect(service.getQuote(8)).resolves.toMatchObject({
      tax: 22.5,
      taxRatePercent: 5,
      total: 472.5
    });
  });

  it("rejects a cart quantity above the latest configured stock", async () => {
    const service = new OrderService({
      client: {
        cart: {
          async findUnique() {
            return {
              cartitem: [{
                quantity: 6,
                product: {
                  id: 5,
                  name: "Bottle",
                  price: "150.00",
                  inStock: true,
                  stockQuantity: 5
                }
              }]
            };
          }
        }
      }
    });

    await expect(service.getQuote(8)).rejects.toThrow(
      "Only 5 units of Bottle are currently available."
    );
  });

  it("allows only one concurrent reservation for the last unit and records its sale", async () => {
    const inventory = stockMocks([{
      id: 11,
      name: "Last unit",
      inStock: true,
      stockQuantity: 1,
      lowStockThreshold: 1,
      lowStockAlertActive: false,
      lowStockAlertAt: null
    }]);
    const service = new OrderService({ client: inventory });
    const item = [{
      productId: 11,
      productName: "Last unit",
      quantity: 1
    }];
    const outcomes = await Promise.allSettled([
      service.deductOrderStock(inventory, 70, 3, item),
      service.deductOrderStock(inventory, 71, 4, item)
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(inventory.getProduct(11)).toMatchObject({
      stockQuantity: 0,
      inStock: false,
      lowStockAlertActive: true
    });
    expect(inventory.history).toHaveLength(1);
    expect(inventory.history[0]).toMatchObject({
      previousQuantity: 1,
      newQuantity: 0,
      quantityChange: -1,
      actionType: "SALE"
    });
  });

  it("scopes order lookup to the signed-in customer", async () => {
    const findFirst = jest.fn(async () => null);
    const service = new OrderService({
      client: { order: { findFirst } }
    });

    await expect(service.getForCustomer(3, "41")).rejects.toThrow("Order not found.");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 41, userId: 3 },
      include: {
        orderitem: {
          orderBy: { createdAt: "asc" },
          include: { product: { select: { imageUrl: true } } }
        },
        payment: true
      }
    });
  });

  it("rejects a non-INR payment currency and invalid GST configuration", async () => {
    const service = new OrderService({ client: {} });
    process.env.STORE_CURRENCY = "USD";
    expect(() => service.storeCurrency()).toThrow("Store currency must be configured as INR.");
    process.env.STORE_CURRENCY = "INR";
    process.env.GST_RATE_PERCENT = "invalid";
    expect(() => service.taxRatePercent()).toThrow("GST_RATE_PERCENT must be between 0 and 100.");
  });

  it("calculates a percentage coupon on the eligible subtotal before GST", async () => {
    const service = new OrderService({
      client: {
        cart: {
          async findUnique() {
            return { cartitem: [{
              quantity: 3,
              product: { id: 5, name: "Bottle", price: "150.00", inStock: true, stockQuantity: 10 }
            }] };
          }
        },
        coupon: {
          async findUnique() {
            return {
              id: 1,
              code: "SAVE10",
              discount: 10,
              discountType: "PERCENTAGE",
              minSpend: "0.00",
              isActive: true,
              startsAt: null,
              expiresAt: null,
              usageLimit: null,
              usageCount: 0
            };
          }
        }
      }
    });

    await expect(service.getQuote(8, " save10 ")).resolves.toEqual({
      subtotal: 450,
      discount: 45,
      shipping: 0,
      tax: 72.9,
      taxRatePercent: 18,
      total: 477.9,
      currency: "INR",
      couponCode: "SAVE10",
      couponDiscountType: "PERCENTAGE"
    });
  });

  it("caps fixed coupon discount to subtotal and rejects ineligible coupons", async () => {
    const coupon = {
      id: 2,
      code: "FIXED999",
      discount: 999,
      discountType: "FIXED",
      minSpend: "0.00",
      isActive: true,
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      usageCount: 0
    };
    const client = {
      cart: {
        async findUnique() {
          return { cartitem: [{
            quantity: 1,
            product: { id: 1, name: "Item", price: "50.00", inStock: true, stockQuantity: 5 }
          }] };
        }
      },
      coupon: {
        async findUnique() {
          return coupon;
        }
      }
    };
    const service = new OrderService({ client });
    client.coupon.findUnique = async () => ({ ...coupon, discount: 10 });
    await expect(service.getQuote(8, "FIXED999")).resolves.toEqual({
      subtotal: 50,
      discount: 10,
      shipping: 0,
      tax: 7.2,
      taxRatePercent: 18,
      total: 47.2,
      currency: "INR",
      couponCode: "FIXED999",
      couponDiscountType: "FIXED"
    });
    client.coupon.findUnique = async () => coupon;
    await expect(service.getQuote(8, "FIXED999")).resolves.toMatchObject({
      subtotal: 50,
      discount: 50,
      tax: 0,
      total: 0
    });
    await expect(service.getQuote(8, "")).rejects.toThrow("Enter a valid coupon code.");
    client.coupon.findUnique = async () => ({ ...coupon, isActive: false });
    await expect(service.getQuote(8, "FIXED999")).rejects.toThrow("This coupon is inactive.");
    client.coupon.findUnique = async () => ({ ...coupon, expiresAt: new Date(Date.now() - 1000) });
    await expect(service.getQuote(8, "FIXED999")).rejects.toThrow("This coupon has expired.");
    client.coupon.findUnique = async () => ({ ...coupon, startsAt: new Date(Date.now() + 60000) });
    await expect(service.getQuote(8, "FIXED999")).rejects.toThrow("This coupon is not active yet.");
    client.coupon.findUnique = async () => ({ ...coupon, minSpend: "100.00" });
    await expect(service.getQuote(8, "FIXED999")).rejects.toThrow("minimum subtotal");
    client.coupon.findUnique = async () => ({ ...coupon, usageLimit: 2, usageCount: 2 });
    await expect(service.getQuote(8, "FIXED999")).rejects.toThrow("usage limit");
  });

  it("completes a fully discounted order without creating a zero-value gateway payment", async () => {
    let savedOrder;
    const inventory = stockMocks([{
      id: 7,
      name: "Complimentary item",
      inStock: true,
      stockQuantity: 10,
      lowStockThreshold: null,
      lowStockAlertActive: false,
      lowStockAlertAt: null
    }]);
    const items = [{
      productId: 7,
      productName: "Complimentary item",
      unitPrice: 50,
      quantity: 1
    }];
    const client = {
      ...inventory,
      order: {
        async findUnique() {
          return savedOrder || null;
        },
        async create({ data }) {
          savedOrder = {
            ...data,
            id: 42,
            orderitem: items,
            payment: null
          };
          return savedOrder;
        }
      },
      payment: {
        async create() {
          throw new Error("A zero-value checkout must not create a gateway payment.");
        }
      },
      cart: {
        async findUnique({ include }) {
          if (include) {
            return {
              cartitem: [{
                quantity: 1,
                product: { id: 7, name: "Complimentary item", price: "50.00", inStock: true, stockQuantity: 10 }
              }]
            };
          }
          return { id: 5 };
        }
      },
      cartitem: {
        async findUnique() {
          return null;
        }
      },
      coupon: {
        async findUnique() {
          return {
            id: 9,
            code: "FREE100",
            discount: 100,
            discountType: "PERCENTAGE",
            minSpend: "0.00",
            isActive: true,
            startsAt: null,
            expiresAt: null,
            usageLimit: null,
            usageCount: 0
          };
        },
        async updateMany() {
          return { count: 1 };
        }
      },
      async $transaction(callback) {
        return callback(client);
      }
    };
    const service = new OrderService({ client });
    const credentials = [process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET];
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    try {
      const checkout = await service.createCheckout(
        3,
        address,
        "free-order-idempotency-key",
        "FREE100"
      );
      expect(checkout).toMatchObject({
        paymentRequired: false,
        order: {
          id: 42,
          status: "PAID",
          totalAmount: 0,
          pricingBreakdown: {
            subtotal: 50,
            discount: 50,
            tax: 0,
            total: 0,
            couponCode: "FREE100"
          },
          payment: null
        },
      });
      await expect(service.createCheckout(
        3,
        address,
        "free-order-idempotency-key",
        "FREE100"
      )).resolves.toMatchObject({ paymentRequired: false, order: { id: 42, status: "PAID" } });
      expect(savedOrder.status).toBe("PAID");
      expect(savedOrder.inventoryDeducted).toBe(true);
      expect(inventory.history).toHaveLength(1);
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      if (credentials[0] === undefined) delete process.env.RAZORPAY_KEY_ID;
      else process.env.RAZORPAY_KEY_ID = credentials[0];
      if (credentials[1] === undefined) delete process.env.RAZORPAY_KEY_SECRET;
      else process.env.RAZORPAY_KEY_SECRET = credentials[1];
    }
  });

  it("marks an order paid only after a valid signature and captured provider status", async () => {
    const order = {
      id: 41,
      userId: 3,
      status: "PAYMENT_PENDING",
      inventoryDeducted: true,
      totalAmount: "25.00",
      currency: "INR",
      shippingAddress: JSON.stringify(address),
      orderitem: [{ id: 1, productId: 2, productName: "Product", unitPrice: "12.50", quantity: 2 }],
      payment: {
        orderId: 41,
        amount: "25.00",
        currency: "INR",
        status: "PENDING",
        razorpayOrderId: "order_test_41",
        razorpayPaymentId: null
      }
    };
    const cartItem = { quantity: 4 };
    const client = {
      order: {
        async findFirst() {
          return { ...order, payment: { ...order.payment } };
        },
        async findUnique() {
          return { ...order, payment: { ...order.payment }, orderitem: order.orderitem };
        },
        async update({ data }) {
          Object.assign(order, data);
          return { ...order, payment: { ...order.payment }, orderitem: order.orderitem };
        }
      },
      payment: {
        async update({ data }) {
          Object.assign(order.payment, data);
        }
      },
      cart: {
        async findUnique() {
          return { id: 4 };
        }
      },
      cartitem: {
        async findUnique() {
          return cartItem;
        },
        async update({ data }) {
          Object.assign(cartItem, data);
        }
      },
      async $transaction(callback) {
        return callback(client);
      }
    };
    global.fetch.mockResolvedValue(jsonResponse({
      id: "pay_test41",
      order_id: "order_test_41",
      status: "captured",
      amount: 2500,
      currency: "INR"
    }));
    const signature = require("node:crypto")
      .createHmac("sha256", "unit-test-secret")
      .update("order_test_41|pay_test41")
      .digest("hex");

    const result = await new OrderService({ client }).verifyPayment(3, "41", {
      razorpay_order_id: "order_test_41",
      razorpay_payment_id: "pay_test41",
      razorpay_signature: signature
    });

    expect(result.verified).toBe(true);
    expect(result.order.status).toBe("PAID");
    expect(order.payment.status).toBe("CAPTURED");
    expect(cartItem.quantity).toBe(2);
  });

  it("restores a cancelled unpaid order once and does not restore it again", async () => {
    const inventory = stockMocks([{
      id: 13,
      name: "Reserved item",
      inStock: false,
      stockQuantity: 0,
      lowStockThreshold: 1,
      lowStockAlertActive: true,
      lowStockAlertAt: new Date("2026-10-14T00:00:00Z")
    }]);
    const order = {
      id: 73,
      userId: 3,
      status: "PAYMENT_PENDING",
      inventoryDeducted: true,
      shippingAddress: JSON.stringify(address),
      orderitem: [{ productId: 13, productName: "Reserved item", quantity: 1 }],
      payment: {
        status: "PENDING",
        razorpayOrderId: null,
        razorpayPaymentId: null
      }
    };
    const client = {
      ...inventory,
      order: {
        async findFirst() {
          return order;
        },
        async update({ data, include }) {
          Object.assign(order, data);
          return include ? { ...order, orderitem: order.orderitem } : order;
        }
      },
      async $transaction(callback) {
        return callback(client);
      }
    };
    const service = new OrderService({ client });

    await expect(service.cancelForCustomer(3, "73")).resolves.toMatchObject({
      status: "CANCELLED"
    });
    await expect(service.cancelForCustomer(3, "73")).rejects.toThrow(
      "This order can no longer be cancelled."
    );
    expect(inventory.getProduct(13)).toMatchObject({
      stockQuantity: 1,
      inStock: true,
      lowStockAlertActive: true
    });
    expect(inventory.history).toHaveLength(1);
    expect(inventory.history[0]).toMatchObject({
      actionType: "RESTORATION",
      reason: "Order #73 cancelled before payment"
    });
  });

  it("rejects manual paid status changes and invalid webhook signatures", async () => {
    const service = new OrderService({ client: {} });
    await expect(service.updateAdminStatus("1", "PAID")).rejects.toThrow(ForbiddenException);
    const rawBody = Buffer.from('{"event":"payment.captured"}');
    await expect(service.handleWebhook(rawBody, "invalid", "evt_1", {
      event: "payment.captured"
    })).rejects.toThrow(ForbiddenException);
  });

  it("keeps a failed Razorpay payment failed and never marks the order paid", async () => {
    const inventory = stockMocks([{
      id: 2,
      name: "Product",
      inStock: true,
      stockQuantity: 3,
      lowStockThreshold: null,
      lowStockAlertActive: false,
      lowStockAlertAt: null
    }]);
    const order = {
      id: 51,
      userId: 3,
      status: "PAYMENT_PENDING",
      inventoryDeducted: true,
      shippingAddress: JSON.stringify({
        address,
        pricingBreakdown: { couponCode: "SAVE10" }
      }),
      orderitem: [{ productId: 2, productName: "Product", quantity: 2 }]
    };
    const payment = {
      orderId: 51,
      amount: "26.55",
      currency: "INR",
      status: "PENDING",
      razorpayOrderId: "order_test_51"
    };
    const paymentUpdate = jest.fn(async ({ data }) => Object.assign(payment, data));
    const orderUpdate = jest.fn(async ({ data }) => Object.assign(order, data));
    const couponUpdate = jest.fn(async () => ({ count: 1 }));
    const body = {
      id: "evt_failed_51",
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_failed_51",
            order_id: "order_test_51",
            amount: 2655,
            currency: "INR",
            error_code: "BAD_GATEWAY"
          }
        }
      }
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = require("node:crypto")
      .createHmac("sha256", "unit-test-webhook-secret")
      .update(rawBody)
      .digest("hex");
    const seenEvents = new Set();
    const client = {
      ...inventory,
      payment: {
        async findUnique() {
          return { ...payment, order: { ...order, orderitem: order.orderitem } };
        },
        update: paymentUpdate
      },
      order: { update: orderUpdate },
      paymentwebhookevent: {
        async create({ data }) {
          if (seenEvents.has(data.eventId)) {
            throw Object.assign(new Error("Duplicate event"), { code: "P2002" });
          }
          seenEvents.add(data.eventId);
          return {};
        },
        async findUnique({ where }) {
          return seenEvents.has(where.eventId) ? { eventId: where.eventId } : null;
        }
      },
      coupon: { updateMany: couponUpdate },
      async $transaction(callback) {
        return callback(client);
      }
    };

    await expect(new OrderService({ client }).handleWebhook(
      rawBody,
      signature,
      body.id,
      body
    )).resolves.toEqual({ received: true });

    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", failureCode: "BAD_GATEWAY" })
    }));
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PAYMENT_FAILED" })
    }));
    expect(order.status).not.toBe("PAID");
    expect(order.inventoryDeducted).toBe(false);
    expect(inventory.getProduct(2).stockQuantity).toBe(5);
    expect(inventory.history).toHaveLength(1);
    expect(inventory.history[0]).toMatchObject({
      previousQuantity: 3,
      newQuantity: 5,
      quantityChange: 2,
      actionType: "RESTORATION",
      reason: "Order #51 payment failed"
    });
    expect(couponUpdate).toHaveBeenCalled();

    await expect(new OrderService({ client }).handleWebhook(
      rawBody,
      signature,
      body.id,
      body
    )).resolves.toEqual({ received: true, duplicate: true });
    expect(inventory.getProduct(2).stockQuantity).toBe(5);
    expect(inventory.history).toHaveLength(1);
  });
});
