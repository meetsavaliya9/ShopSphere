const {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
  ServiceUnavailableException
} = require("@nestjs/common");
const {
  createHmac,
  timingSafeEqual
} = require("node:crypto");
const { PrismaService } = require("../prisma/prisma.service");
const { getStoreSettings } = require("../admin/store-settings");
const { applyStockChange } = require("../products/inventory-stock");
const {
  getCustomerPermissions,
  requireCustomerPermission
} = require("../auth/customer-permissions");

const ADDRESS_FIELDS = new Set([
  "fullName",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country"
]);
const ORDER_INCLUDE = {
  orderitem: { orderBy: { createdAt: "asc" } },
  payment: true
};
const CUSTOMER_ORDER_INCLUDE = {
  orderitem: {
    orderBy: { createdAt: "asc" },
    include: { product: { select: { imageUrl: true } } }
  },
  payment: true
};

function normalizeAddress(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !ADDRESS_FIELDS.has(key))
  ) {
    throw new BadRequestException("A valid shipping address is required.");
  }

  const address = {};
  for (const field of ADDRESS_FIELDS) {
    const value = input[field];
    if (field === "addressLine2" && (value === undefined || value === null || value === "")) {
      address[field] = "";
      continue;
    }
    if (typeof value !== "string" || !value.trim() || value.trim().length > 200) {
      throw new BadRequestException(`A valid ${field} is required.`);
    }
    address[field] = value.trim();
  }
  if (!/^[A-Z]{2}$/.test(address.country)) {
    throw new BadRequestException("Country must be a two-letter uppercase country code.");
  }
  if (address.phone.length < 7 || !/^[+\d().\-\s]+$/.test(address.phone)) {
    throw new BadRequestException("Phone number is invalid.");
  }
  return address;
}

function orderView(order, includeCustomer = false) {
  if (!order) return null;
  const {
    orderitem = [],
    payment,
    shippingAddress,
    totalAmount,
    user,
    ...fields
  } = order;
  let address = shippingAddress;
  if (typeof address === "string") {
    address = JSON.parse(address);
  }
  let pricingBreakdown = null;
  if (
    address &&
    typeof address === "object" &&
    Object.hasOwn(address, "address") &&
    Object.hasOwn(address, "pricingBreakdown")
  ) {
    pricingBreakdown = address.pricingBreakdown;
    address = address.address;
  }
  const result = {
    ...fields,
    shippingAddress: address,
    totalAmount: Number(totalAmount),
    invoiceNumber: `SS-${String(fields.id).padStart(6, "0")}`,
    pricingBreakdown,
    items: orderitem.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      imageUrl: item.product?.imageUrl || null,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      lineTotal: Math.round(Number(item.unitPrice) * item.quantity * 100) / 100
    })),
    payment: payment
      ? {
          status: payment.status,
          razorpayOrderId: payment.razorpayOrderId,
          razorpayPaymentId: payment.razorpayPaymentId,
          amount: Number(payment.amount),
          currency: payment.currency,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt
        }
      : null
  };
  if (includeCustomer && user) {
    result.user = { id: user.id, name: user.name, email: user.email };
  }
  return result;
}

function safeSignatureEqual(expected, received) {
  if (
    typeof received !== "string" ||
    !/^[a-f0-9]{64}$/i.test(received)
  ) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer);
}

class OrderService {
  constructor(prismaService) {
    this.prisma = prismaService.client;
  }

  async createCheckout(userId, addressInput, idempotencyKey, couponCodeInput) {
    await requireCustomerPermission(this.prisma, userId, "ACCESS_CHECKOUT");
    if (couponCodeInput) {
      await requireCustomerPermission(this.prisma, userId, "APPLY_COUPON");
    }
    if (!getStoreSettings().allowCheckout) {
      throw new ForbiddenException("Checkout is temporarily disabled by store management.");
    }
    if (
      typeof idempotencyKey !== "string" ||
      !/^[A-Za-z0-9._~-]{16,64}$/.test(idempotencyKey)
    ) {
      throw new BadRequestException("A valid Idempotency-Key header is required.");
    }
    const address = normalizeAddress(addressInput);
    const couponCode = this.normalizeCouponCode(couponCodeInput);
    const currency = this.storeCurrency();
    const existing = await this.prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: { payment: true, orderitem: { orderBy: { createdAt: "asc" } } }
    });
    if (
      existing?.status === "PAID" &&
      !existing.payment &&
      Number(existing.totalAmount) === 0
    ) {
      return {
        paymentRequired: false,
        order: this.customerOrderView(existing, await this.customerPermissions(userId))
      };
    }
    if (
      existing &&
      (existing.status !== "PAYMENT_PENDING" || existing.payment?.status === "CAPTURED")
    ) {
      throw new ConflictException("This checkout request is no longer pending.");
    }
    if (existing) {
      const existingCoupon = orderView(existing).pricingBreakdown?.couponCode || null;
      if (existingCoupon !== couponCode) {
        throw new ConflictException("This checkout was already started with a different coupon. Start a new checkout.");
      }
    }
    if (existing?.payment?.razorpayOrderId) {
      return this.checkoutResponse(existing, existing.payment, this.razorpayCredentials().keyId);
    }

    let order = existing;
    if (!order) {
      try {
        const createdCheckout = await this.prisma.$transaction(async (transaction) => {
          const items = await this.getCheckoutItems(userId, transaction);
          const pricingBreakdown = await this.calculateCheckoutPricing(
            items,
            currency,
            couponCode,
            transaction,
            true
          );
          const totalAmount = pricingBreakdown.total;
          if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 99999999.99) {
            throw new BadRequestException("The order total is invalid.");
          }
          const created = await transaction.order.create({
            data: {
              userId,
              idempotencyKey,
              status: totalAmount === 0 ? "PAID" : "PAYMENT_PENDING",
              inventoryDeducted: true,
              totalAmount,
              currency,
              shippingAddress: JSON.stringify({ address, pricingBreakdown }),
              updatedAt: new Date(),
              orderitem: { create: items }
            },
            include: { orderitem: { orderBy: { createdAt: "asc" } } }
          });
          await this.deductOrderStock(transaction, created.id, userId, items);
          if (totalAmount === 0) {
            await this.consumePurchasedItems(transaction, userId, items);
            return { order: created, paymentRequired: false };
          }
          await transaction.payment.create({
            data: {
              orderId: created.id,
              amount: totalAmount,
              currency,
              status: "PENDING",
              updatedAt: new Date()
            }
          });
          return { order: created, paymentRequired: true };
        }, { isolationLevel: "Serializable" });
        order = createdCheckout.order;
        if (!createdCheckout.paymentRequired) {
          return {
            paymentRequired: false,
            order: this.customerOrderView(order, await this.customerPermissions(userId))
          };
        }
      } catch (error) {
        if (error?.code === "P2034") {
          throw new ConflictException("Checkout availability changed. Review your order and try again.");
        }
        if (error?.code !== "P2002") throw error;
        order = await this.prisma.order.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          include: { payment: true }
        });
        if (!order) throw error;
        if (
          order.status === "PAID" &&
          !order.payment &&
          Number(order.totalAmount) === 0
        ) {
          const completeOrder = await this.prisma.order.findUnique({
            where: { userId_idempotencyKey: { userId, idempotencyKey } },
            include: ORDER_INCLUDE
          });
          return {
            paymentRequired: false,
            order: this.customerOrderView(completeOrder, await this.customerPermissions(userId))
          };
        }
        if (order.payment?.razorpayOrderId) {
          return this.checkoutResponse(order, order.payment, this.razorpayCredentials().keyId);
        }
      }
    }

    const payment = existing?.payment || await this.prisma.payment.findUnique({
      where: { orderId: order.id }
    });
    if (!payment) {
      throw new ServiceUnavailableException("The pending payment record is unavailable.");
    }
    const credentials = this.razorpayCredentials();
    const providerOrder = await this.createRazorpayOrder(order, payment, credentials);
    const updatedPayment = await this.prisma.payment.update({
      where: { orderId: order.id },
      data: { razorpayOrderId: providerOrder.id, updatedAt: new Date() }
    });
    return this.checkoutResponse(order, updatedPayment, credentials.keyId);
  }

  async getQuote(userId, couponCode) {
    await requireCustomerPermission(this.prisma, userId, "ACCESS_CHECKOUT");
    if (couponCode) {
      await requireCustomerPermission(this.prisma, userId, "APPLY_COUPON");
    }
    const items = await this.getCheckoutItems(userId);
    const quote = await this.calculateCheckoutPricing(items, this.storeCurrency(), couponCode);
    const permissions = new Set(await getCustomerPermissions(this.prisma));
    if (!permissions.has("VIEW_ORDER_PRICE_BREAKDOWN")) {
      return { total: quote.total };
    }
    if (!permissions.has("VIEW_DISCOUNT_DETAILS")) {
      return {
        ...quote,
        couponCode: null,
        couponDiscountType: null,
        discount: 0
      };
    }
    return quote;
  }

  async getCheckoutItems(userId, client = this.prisma) {
    const cart = await client.cart.findUnique({
      where: { userId },
      include: {
        cartitem: {
          include: { product: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!cart?.cartitem?.length) {
      throw new BadRequestException("Your bag is empty.");
    }
    return cart.cartitem.map(({ product, quantity }) => {
      if (!product || !product.inStock) {
        throw new ConflictException("One or more products in your bag are unavailable.");
      }
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new ConflictException("A bag item has an invalid quantity.");
      }
      if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0) {
        throw new ConflictException(
          `${product.name} does not have a configured available quantity. Please contact the store.`
        );
      }
      if (quantity > product.stockQuantity) {
        throw new ConflictException(
          `Only ${product.stockQuantity} unit${product.stockQuantity === 1 ? "" : "s"} of ${product.name} are currently available. Update your bag and try again.`
        );
      }
      return {
        productId: product.id,
        productName: product.name,
        unitPrice: Number(product.price),
        quantity
      };
    });
  }

  async calculateCheckoutPricing(items, currency, couponCode, client = this.prisma, reserve = false) {
    const subtotalCents = items.reduce(
      (sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity,
      0
    );
    const normalizedCode = this.normalizeCouponCode(couponCode);
    const coupon = normalizedCode
      ? await this.findEligibleCoupon(client, normalizedCode, subtotalCents)
      : null;
    if (coupon && reserve) {
      const now = new Date();
      const where = {
        id: coupon.id,
        isActive: true,
        minSpend: { lte: subtotalCents / 100 },
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }]
      };
      if (coupon.usageLimit !== null) {
        where.usageCount = { lt: coupon.usageLimit };
      }
      const reserved = await client.coupon.updateMany({
        where,
        data: { usageCount: { increment: 1 }, updatedAt: now }
      });
      if (reserved.count !== 1) {
        throw new ConflictException("This coupon is no longer available. Reapply a valid coupon.");
      }
    }
    const discountCents = coupon?.discountCents || 0;
    const shippingCents = 0;
    const taxRatePercent = this.taxRatePercent();
    const taxableCents = subtotalCents - discountCents;
    const taxCents = Math.round(taxableCents * taxRatePercent / 100);
    const totalCents = taxableCents + shippingCents + taxCents;
    return {
      subtotal: subtotalCents / 100,
      discount: discountCents / 100,
      shipping: shippingCents / 100,
      tax: taxCents / 100,
      taxRatePercent,
      total: totalCents / 100,
      currency,
      ...(coupon
        ? { couponCode: coupon.code, couponDiscountType: coupon.discountType }
        : {})
    };
  }

  normalizeCouponCode(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      throw new BadRequestException("Coupon code must be text.");
    }
    const code = value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,50}$/.test(code)) {
      throw new BadRequestException("Enter a valid coupon code.");
    }
    return code;
  }

  async findEligibleCoupon(client, value, subtotalCents) {
    const code = this.normalizeCouponCode(value);
    if (!code) return null;
    const coupon = await client.coupon.findUnique({ where: { code } });
    if (!coupon) throw new BadRequestException("Coupon code was not found.");
    if (!coupon.isActive) throw new ConflictException("This coupon is inactive.");
    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new ConflictException("This coupon is not active yet.");
    }
    if (coupon.expiresAt && coupon.expiresAt <= now) {
      throw new ConflictException("This coupon has expired.");
    }
    if (subtotalCents < Math.round(Number(coupon.minSpend) * 100)) {
      throw new BadRequestException(
        `This coupon requires a minimum subtotal of ₹${Number(coupon.minSpend).toFixed(2)}.`
      );
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new ConflictException("This coupon has reached its usage limit.");
    }
    const discountType = coupon.discountType || "PERCENTAGE";
    if (!["PERCENTAGE", "FIXED"].includes(discountType)) {
      throw new ServiceUnavailableException("This coupon has an unsupported discount type.");
    }
    if (
      !Number.isSafeInteger(coupon.discount) ||
      coupon.discount < 1 ||
      (discountType === "PERCENTAGE" && coupon.discount > 100)
    ) {
      throw new ServiceUnavailableException("This coupon has an invalid discount value.");
    }
    const discountCents = Math.min(
      subtotalCents,
      discountType === "PERCENTAGE"
        ? Math.round(subtotalCents * coupon.discount / 100)
        : coupon.discount * 100
    );
    return {
      id: coupon.id,
      code: coupon.code,
      discountType,
      discountCents,
      usageLimit: coupon.usageLimit
    };
  }

  async releaseCouponReservation(client, order) {
    let shippingSnapshot = order.shippingAddress;
    if (typeof shippingSnapshot === "string") {
      shippingSnapshot = JSON.parse(shippingSnapshot);
    }
    const couponCode = shippingSnapshot?.pricingBreakdown?.couponCode;
    if (couponCode) {
      await client.coupon.updateMany({
        where: { code: couponCode, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 }, updatedAt: new Date() }
      });
    }
  }

  async listForCustomer(userId) {
    await requireCustomerPermission(this.prisma, userId, "VIEW_ORDERS");
    const permissions = await this.customerPermissions(userId);
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: CUSTOMER_ORDER_INCLUDE,
      orderBy: { createdAt: "desc" }
    });
    return {
      orders: orders.map((order) => this.customerOrderView(order, permissions))
    };
  }

  async getForCustomer(userId, id) {
    await requireCustomerPermission(this.prisma, userId, "VIEW_ORDER_DETAILS");
    const permissions = await this.customerPermissions(userId);
    const orderId = this.parseId(id);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: CUSTOMER_ORDER_INCLUDE
    });
    if (!order) throw new NotFoundException("Order not found.");
    return this.customerOrderView(order, permissions);
  }

  async cancelForCustomer(userId, id) {
    await requireCustomerPermission(this.prisma, userId, "CANCEL_ORDERS");
    const orderId = this.parseId(id);
    const cancelled = await this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: { id: orderId, userId },
        include: CUSTOMER_ORDER_INCLUDE
      });
      if (!order) throw new NotFoundException("Order not found.");
      if (
        order.status !== "PAYMENT_PENDING" ||
        order.payment?.status !== "PENDING" ||
        order.payment.razorpayOrderId ||
        order.payment.razorpayPaymentId
      ) {
        throw new ConflictException("This order can no longer be cancelled.");
      }
      await this.restoreOrderStock(
        transaction,
        order,
        `Order #${order.id} cancelled before payment`
      );
      const cancelled = await transaction.order.update({
        where: { id: orderId },
        data: {
          status: "CANCELLED",
          inventoryDeducted: false,
          updatedAt: new Date()
        },
        include: CUSTOMER_ORDER_INCLUDE
      });
      await this.releaseCouponReservation(transaction, order);
      return cancelled;
    }, { isolationLevel: "Serializable" });
    return this.customerOrderView(cancelled, await this.customerPermissions(userId));
  }

  async customerPermissions(userId) {
    const rows = await this.prisma.customerpermission.findMany({
      where: { enabled: false },
      select: { permission: true }
    });
    return new Set(rows.map(({ permission }) => permission));
  }

  customerOrderView(order, disabledPermissions) {
    const view = orderView(order);
    if (disabledPermissions.has("VIEW_ORDER_DETAILS")) {
      view.shippingAddress = null;
      view.items = view.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        imageUrl: item.imageUrl,
        quantity: item.quantity
      }));
    }
    if (disabledPermissions.has("VIEW_PAYMENT_HISTORY")) {
      view.payment = null;
    }
    view.pricingBreakdown = this.customerPricingBreakdown(order, disabledPermissions);
    return view;
  }

  customerPricingBreakdown(order, disabledPermissions) {
    if (disabledPermissions.has("VIEW_ORDER_PRICE_BREAKDOWN")) return null;
    const breakdown = orderView(order).pricingBreakdown;
    if (!breakdown || !disabledPermissions.has("VIEW_DISCOUNT_DETAILS")) return breakdown;
    return {
      ...breakdown,
      discount: 0,
      couponCode: null,
      couponDiscountType: null
    };
  }

  async verifyPayment(userId, id, input) {
    await requireCustomerPermission(this.prisma, userId, "ACCESS_CHECKOUT");
    const orderId = this.parseId(id);
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 3 ||
      typeof input.razorpay_order_id !== "string" ||
      typeof input.razorpay_payment_id !== "string" ||
      typeof input.razorpay_signature !== "string"
    ) {
      throw new BadRequestException("A valid payment verification response is required.");
    }
    const credentials = this.razorpayCredentials();
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { payment: true }
    });
    if (!order) throw new NotFoundException("Order not found.");
    if (
      !order.payment ||
      order.payment.razorpayOrderId !== input.razorpay_order_id
    ) {
      throw new ForbiddenException("The payment does not belong to this order.");
    }
    const expectedSignature = createHmac("sha256", credentials.keySecret)
      .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
      .digest("hex");
    if (!safeSignatureEqual(expectedSignature, input.razorpay_signature)) {
      throw new ForbiddenException("Payment signature verification failed.");
    }

    const providerPayment = await this.getRazorpayPayment(
      input.razorpay_payment_id,
      credentials
    );
    if (
      providerPayment.id !== input.razorpay_payment_id ||
      providerPayment.order_id !== input.razorpay_order_id ||
      providerPayment.status !== "captured" ||
      providerPayment.amount !== Math.round(Number(order.totalAmount) * 100) ||
      providerPayment.currency !== order.currency
    ) {
      throw new ConflictException("The payment provider has not confirmed this order as captured.");
    }

    const paidOrder = await this.markCaptured({
      orderId,
      razorpayOrderId: input.razorpay_order_id,
      razorpayPaymentId: input.razorpay_payment_id
    });
    return {
      verified: true,
      order: this.customerOrderView(paidOrder, await this.customerPermissions(userId))
    };
  }

  async listAdminOrders(query = {}) {
    const where = {};
    if (query.status && query.status !== "ALL") {
      if (!["PAYMENT_PENDING", "PAID", "PAYMENT_FAILED", "CANCELLED"].includes(query.status)) {
        throw new BadRequestException("Order status filter is invalid.");
      }
      where.status = query.status;
    }
    if (query.search) {
      const search = String(query.search).trim();
      if (!search || search.length > 100) {
        throw new BadRequestException("Order search is invalid.");
      }
      const numericId = /^[1-9]\d*$/.test(search) ? Number(search) : null;
      where.OR = [
        ...(numericId && Number.isSafeInteger(numericId) ? [{ id: numericId }] : []),
        {
          user: {
            is: {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } }
              ]
            }
          }
        }
      ];
    }
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 10, 1, 100, "limit");
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { ...ORDER_INCLUDE, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      this.prisma.order.count({ where })
    ]);
    return {
      data: orders.map((order) => orderView(order, true)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async listManagerOrders(managerId, includeDetails, query = {}) {
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 10, 1, 100, "limit");
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          orderitem: {
            some: { product: { is: { managerId: Number(managerId) } } }
          }
        },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          orderitem: {
            where: { product: { is: { managerId: Number(managerId) } } },
            select: {
              id: true,
              productName: true,
              quantity: true,
              unitPrice: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      this.prisma.order.count({
        where: {
          orderitem: {
            some: { product: { is: { managerId: Number(managerId) } } }
          }
        }
      })
    ]);

    return {
      data: orders.map((order) => ({
        id: order.id,
        status: order.status,
        assignedItemsTotal: Math.round(order.orderitem.reduce(
          (sum, item) => sum + Number(item.unitPrice) * item.quantity,
          0
        ) * 100) / 100,
        currency: order.currency,
        createdAt: order.createdAt,
        ...(includeDetails ? {
          items: order.orderitem.map((item) => ({
            ...item,
            unitPrice: Number(item.unitPrice),
            lineTotal: Math.round(Number(item.unitPrice) * item.quantity * 100) / 100
          }))
        } : {})
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async updateAdminStatus(id, status) {
    const orderId = this.parseId(id);
    if (!["PAYMENT_PENDING", "PAYMENT_FAILED"].includes(status)) {
      throw new ForbiddenException("Payment status can only be changed after provider verification.");
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: orderId },
        include: { payment: true, orderitem: true }
      });
      if (!order) throw new NotFoundException("Order not found.");
      if (order.status === "PAID" || order.status === "CANCELLED") {
        throw new ConflictException("A paid or cancelled order cannot be changed.");
      }
      if (order.payment?.status === "CAPTURED") {
        throw new ConflictException("A captured payment cannot be changed by an administrator.");
      }
      if (status === "PAYMENT_PENDING" && order.status !== "PAYMENT_PENDING") {
        throw new ConflictException("A failed payment cannot be reset by an administrator.");
      }
      if (status === "PAYMENT_FAILED" && order.status === "PAYMENT_PENDING") {
        await this.restoreOrderStock(
          transaction,
          order,
          `Order #${order.id} payment marked failed by administrator`
        );
        await transaction.payment.update({
          where: { orderId },
          data: { status: "FAILED", failureCode: "ADMIN_MARKED_FAILED", updatedAt: new Date() }
        });
        await this.releaseCouponReservation(transaction, order);
      }
      return transaction.order.update({
        where: { id: orderId },
        data: {
          status,
          ...(status === "PAYMENT_FAILED" ? { inventoryDeducted: false } : {}),
          updatedAt: new Date()
        },
        include: { ...ORDER_INCLUDE, user: { select: { id: true, name: true, email: true } } }
      });
    }, { isolationLevel: "Serializable" });
    return orderView(updated, true);
  }

  async listAdminPayments(query = {}) {
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 10, 1, 100, "limit");
    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        include: {
          order: {
            include: { user: { select: { id: true, name: true, email: true } } }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      this.prisma.payment.count()
    ]);
    return {
      data: payments.map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        customerName: payment.order.user.name,
        customerEmail: payment.order.user.email,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        razorpayOrderId: payment.razorpayOrderId || null,
        razorpayPaymentId: payment.razorpayPaymentId || null,
        failureCode: payment.failureCode || null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async handleWebhook(rawBody, signature, eventId, body) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ServiceUnavailableException("Payment webhooks are not configured.");
    }
    if (!Buffer.isBuffer(rawBody) || typeof signature !== "string") {
      throw new BadRequestException("A signed payment webhook is required.");
    }
    const expectedSignature = createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");
    if (!safeSignatureEqual(expectedSignature, signature)) {
      throw new ForbiddenException("Payment webhook signature verification failed.");
    }
    const webhookId = typeof eventId === "string" && eventId
      ? eventId
      : body?.id;
    if (typeof webhookId !== "string" || webhookId.length > 100) {
      throw new BadRequestException("Payment webhook event ID is invalid.");
    }
    const eventType = body?.event;
    if (typeof eventType !== "string" || eventType.length > 100) {
      throw new BadRequestException("Payment webhook event type is invalid.");
    }
    const entity = body?.payload?.payment?.entity;
    if (
      !entity ||
      typeof entity.order_id !== "string" ||
      typeof entity.id !== "string" ||
      !Number.isSafeInteger(entity.amount) ||
      typeof entity.currency !== "string"
    ) {
      throw new BadRequestException("Payment webhook payload is invalid.");
    }
    if (!["payment.captured", "payment.failed"].includes(eventType)) {
      return { received: true, ignored: true };
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        const payment = await transaction.payment.findUnique({
          where: { razorpayOrderId: entity.order_id },
            include: { order: { include: { orderitem: true } } }
        });
        if (!payment) throw new NotFoundException("Payment order was not found.");
        if (
          entity.amount !== Math.round(Number(payment.amount) * 100) ||
          entity.currency !== payment.currency
        ) {
          throw new ConflictException("Payment webhook amount or currency does not match.");
        }
        await transaction.paymentwebhookevent.create({
          data: { eventId: webhookId, eventType }
        });
        if (eventType === "payment.captured") {
          if (payment.order.status === "CANCELLED") {
            throw new ConflictException("A cancelled order cannot be marked paid.");
          }
          if (payment.order.status === "PAYMENT_FAILED") {
            throw new ConflictException("A failed order cannot be marked paid.");
          }
          if (
            payment.order.status === "PAYMENT_PENDING" &&
            !payment.order.inventoryDeducted
          ) {
            await this.deductOrderStock(
              transaction,
              payment.order.id,
              payment.order.userId,
              payment.order.orderitem
            );
          }
          await transaction.payment.update({
            where: { orderId: payment.orderId },
            data: {
              status: "CAPTURED",
              razorpayPaymentId: entity.id,
              failureCode: null,
              updatedAt: new Date()
            }
          });
          await transaction.order.update({
            where: { id: payment.orderId },
            data: {
              status: "PAID",
              inventoryDeducted: true,
              updatedAt: new Date()
            }
          });
          await this.consumePurchasedItems(
            transaction,
            payment.order.userId,
            payment.order.orderitem
          );
        } else if (payment.status !== "CAPTURED" && payment.order.status !== "PAYMENT_FAILED") {
          const failureCode = typeof entity.error_code === "string"
            ? entity.error_code.slice(0, 100)
            : "PAYMENT_FAILED";
          await transaction.payment.update({
            where: { orderId: payment.orderId },
            data: { status: "FAILED", failureCode, updatedAt: new Date() }
          });
          if (payment.order.status !== "CANCELLED") {
            await this.restoreOrderStock(
              transaction,
              payment.order,
              `Order #${payment.order.id} payment failed`
            );
            await transaction.order.update({
              where: { id: payment.orderId },
              data: {
                status: "PAYMENT_FAILED",
                inventoryDeducted: false,
                updatedAt: new Date()
              }
            });
            await this.releaseCouponReservation(transaction, payment.order);
          }
        }
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error?.code === "P2002") {
        const existingEvent = await this.prisma.paymentwebhookevent.findUnique({
          where: { eventId: webhookId }
        });
        if (existingEvent) return { received: true, duplicate: true };
      }
      throw error;
    }
    return { received: true };
  }

  async markCaptured({ orderId, razorpayOrderId, razorpayPaymentId }) {
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: orderId },
        include: { payment: true, orderitem: true }
      });
      if (!order || order.payment?.razorpayOrderId !== razorpayOrderId) {
        throw new NotFoundException("Order payment was not found.");
      }
      if (
        order.payment.razorpayPaymentId &&
        order.payment.razorpayPaymentId !== razorpayPaymentId
      ) {
        throw new ConflictException("A different payment is already recorded for this order.");
      }
      if (order.status === "CANCELLED") {
        throw new ConflictException("A cancelled order cannot be marked paid.");
      }
      if (order.status === "PAYMENT_FAILED") {
        throw new ConflictException("A failed order cannot be marked paid.");
      }
      if (
        order.status === "PAYMENT_PENDING" &&
        !order.inventoryDeducted
      ) {
        await this.deductOrderStock(transaction, order.id, order.userId, order.orderitem);
      }
      await transaction.payment.update({
        where: { orderId },
        data: {
          status: "CAPTURED",
          razorpayPaymentId,
          failureCode: null,
          updatedAt: new Date()
        }
      });
      const updated = await transaction.order.update({
        where: { id: orderId },
        data: {
          status: "PAID",
          inventoryDeducted: true,
          updatedAt: new Date()
        },
        include: ORDER_INCLUDE
      });
      await this.consumePurchasedItems(transaction, order.userId, order.orderitem);
      return updated;
    }, { isolationLevel: "Serializable" });
  }

  async deductOrderStock(transaction, orderId, userId, items) {
    for (const item of items || []) {
      if (!item.productId) {
        throw new ConflictException(`${item.productName} is no longer available for purchase.`);
      }
      const product = await transaction.product.findUnique({
        where: { id: item.productId }
      });
      if (!product || !product.inStock || !Number.isSafeInteger(product.stockQuantity)) {
        throw new ConflictException(`${item.productName} does not have a configured available quantity.`);
      }
      if (item.quantity > product.stockQuantity) {
        throw new ConflictException(
          `Only ${product.stockQuantity} unit${product.stockQuantity === 1 ? "" : "s"} of ${item.productName} are currently available.`
        );
      }
      await applyStockChange(transaction, {
        product,
        newQuantity: product.stockQuantity - item.quantity,
        actorId: userId,
        actionType: "SALE",
        reason: `Order #${orderId} stock reserved at checkout`
      });
    }
  }

  async restoreOrderStock(transaction, order, reason) {
    if (!order.inventoryDeducted) return false;
    for (const item of order.orderitem || []) {
      if (!item.productId) continue;
      const product = await transaction.product.findUnique({
        where: { id: item.productId }
      });
      if (!product || !Number.isSafeInteger(product.stockQuantity)) {
        throw new ConflictException(`${item.productName} stock could not be restored safely.`);
      }
      if (product.stockQuantity + item.quantity > 2147483647) {
        throw new ConflictException(`${item.productName} stock cannot be restored safely.`);
      }
      await applyStockChange(transaction, {
        product,
        newQuantity: product.stockQuantity + item.quantity,
        actorId: null,
        actionType: "RESTORATION",
        reason
      });
    }
    return true;
  }

  async consumePurchasedItems(transaction, userId, items) {
    const cart = await transaction.cart.findUnique({
      where: { userId },
      select: { id: true }
    });
    if (!cart) return;
    for (const item of items || []) {
      if (!item.productId) continue;
      const cartItem = await transaction.cartitem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: item.productId } }
      });
      if (!cartItem) continue;
      if (cartItem.quantity <= item.quantity) {
        await transaction.cartitem.delete({
          where: { cartId_productId: { cartId: cart.id, productId: item.productId } }
        });
      } else {
        await transaction.cartitem.update({
          where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
          data: { quantity: cartItem.quantity - item.quantity, updatedAt: new Date() }
        });
      }
    }
  }

  async createRazorpayOrder(order, payment, credentials) {
    let response;
    try {
      response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          amount: Math.round(Number(payment.amount) * 100),
          currency: payment.currency,
          receipt: `ss-${order.id}-${order.idempotencyKey.slice(0, 24)}`
        }),
        signal: AbortSignal.timeout(8000)
      });
    } catch (error) {
      console.error("Razorpay order request failed:", {
        orderId: order.id,
        errorName: error?.name || "Error",
        code: typeof error?.code === "string" ? error.code : undefined
      });
      throw new BadGatewayException("The payment provider could not start checkout.");
    }
    if (!response.ok) {
      console.error("Razorpay order request was rejected:", {
        orderId: order.id,
        providerStatus: response.status
      });
      throw new BadGatewayException("The payment provider could not start checkout.");
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new BadGatewayException("The payment provider returned an invalid checkout response.");
    }
    if (
      !result ||
      typeof result.id !== "string" ||
      result.amount !== Math.round(Number(payment.amount) * 100) ||
      result.currency !== payment.currency
    ) {
      throw new BadGatewayException("The payment provider returned incomplete checkout details.");
    }
    return result;
  }

  async getRazorpayPayment(paymentId, credentials) {
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
      throw new BadRequestException("Payment ID is invalid.");
    }
    let response;
    try {
      response = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: {
            authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`
          },
          cache: "no-store",
          signal: AbortSignal.timeout(8000)
        }
      );
    } catch (error) {
      console.error("Razorpay payment verification request failed:", {
        errorName: error?.name || "Error",
        code: typeof error?.code === "string" ? error.code : undefined
      });
      throw new BadGatewayException("The payment provider could not verify the payment.");
    }
    if (!response.ok) {
      console.error("Razorpay payment verification was rejected:", {
        providerStatus: response.status
      });
      throw new BadGatewayException("The payment provider could not verify the payment.");
    }
    try {
      return await response.json();
    } catch {
      throw new BadGatewayException("The payment provider returned an invalid verification response.");
    }
  }

  async checkoutResponse(order, payment, publicKey) {
    if (!payment.razorpayOrderId) {
      throw new ConflictException("The payment provider has not created a checkout order.");
    }
    return {
      publicKey,
      razorpayOrder: {
        id: payment.razorpayOrderId,
        amount: Math.round(Number(payment.amount) * 100),
        currency: payment.currency
      },
      order: {
        id: order.id,
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        pricingBreakdown: this.customerPricingBreakdown(
          order,
          await this.customerPermissions(order.userId)
        )
      }
    };
  }

  razorpayCredentials() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException("Razorpay checkout is not configured.");
    }
    return { keyId, keySecret };
  }

  storeCurrency() {
    const currency = process.env.STORE_CURRENCY || "INR";
    if (currency !== "INR") {
      throw new ServiceUnavailableException("Store currency must be configured as INR.");
    }
    return currency;
  }

  taxRatePercent() {
    const configuredRate = process.env.GST_RATE_PERCENT ?? "18";
    if (!/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/.test(configuredRate)) {
      throw new ServiceUnavailableException("GST_RATE_PERCENT must be between 0 and 100.");
    }
    const rate = Number(configuredRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new ServiceUnavailableException("GST_RATE_PERCENT must be between 0 and 100.");
    }
    return rate;
  }

  parseInteger(value, fallback, minimum, maximum, field) {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new BadRequestException(`${field} must be between ${minimum} and ${maximum}.`);
    }
    return parsed;
  }

  parseId(value) {
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value))) {
      throw new BadRequestException("Order ID is invalid.");
    }
    return Number(value);
  }
}

Inject(PrismaService)(OrderService, undefined, 0);
Injectable()(OrderService);

module.exports = { OrderService, normalizeAddress, orderView, safeSignatureEqual };
