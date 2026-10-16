const {
  BadRequestException,
  Body,
  Controller,
  Get,
  ForbiddenException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} = require("@nestjs/common");
const { CsrfGuard, SessionAuthGuard } = require("../auth/auth-security");
const { CustomerRoleGuard } = require("../cart/cart.controller");
const { AdminOnlyGuard, ManagerOnlyGuard } = require("../products/product.controller");
const { OrderService } = require("./order.service");

class CustomerOrderController {
  constructor(orders) {
    this.orders = orders;
  }

  async quote(request, response) {
    response.status(200).json({
      data: await this.orders.getQuote(request.user.id)
    });
  }

  async applyCoupon(request, body, response) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, "couponCode") ||
      typeof body.couponCode !== "string"
    ) {
      throw new BadRequestException("Provide only a couponCode string.");
    }
    response.status(200).json({
      data: await this.orders.getQuote(request.user.id, body.couponCode)
    });
  }

  async create(request, body, response) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !["shippingAddress", "couponCode"].includes(key)) ||
      !Object.hasOwn(body, "shippingAddress") ||
      (Object.hasOwn(body, "couponCode") &&
        body.couponCode !== null &&
        typeof body.couponCode !== "string")
    ) {
      throw new BadRequestException("Provide a shippingAddress and optional couponCode.");
    }
    const result = await this.orders.createCheckout(
      request.user.id,
      body?.shippingAddress,
      request.get("idempotency-key"),
      body?.couponCode
    );
    response.status(201).json({ data: result });
  }

  async list(request, response) {
    response.status(200).json({
      data: await this.orders.listForCustomer(request.user.id)
    });
  }

  async get(request, id, response) {
    response.status(200).json({
      data: await this.orders.getForCustomer(request.user.id, id)
    });
  }

  async verify(request, id, body, response) {
    response.status(200).json({
      data: await this.orders.verifyPayment(request.user.id, id, body)
    });
  }

  async cancel(request, id, response) {
    response.status(200).json({
      data: await this.orders.cancelForCustomer(request.user.id, id)
    });
  }
}

Inject(OrderService)(CustomerOrderController, undefined, 0);
Controller("orders")(CustomerOrderController);
UseGuards(SessionAuthGuard, CustomerRoleGuard)(CustomerOrderController);

const customerOrderPrototype = CustomerOrderController.prototype;
function applyRoute(prototype, method, decorator, path, guards, parameters) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  decorator(path)(prototype, method, descriptor);
  if (guards.length) UseGuards(...guards)(prototype, method, descriptor);
  for (const [factory, index] of parameters) factory()(prototype, method, index);
}

applyRoute(customerOrderPrototype, "quote", Get, "quote", [], [[Req, 0], [Res, 1]]);
applyRoute(customerOrderPrototype, "applyCoupon", Post, "quote", [CsrfGuard], [[Req, 0], [Body, 1], [Res, 2]]);
applyRoute(customerOrderPrototype, "create", Post, "", [CsrfGuard], [[Req, 0], [Body, 1], [Res, 2]]);
applyRoute(customerOrderPrototype, "list", Get, "", [], [[Req, 0], [Res, 1]]);
applyRoute(customerOrderPrototype, "get", Get, ":id", [], [[Req, 0], [() => Param("id"), 1], [Res, 2]]);
applyRoute(customerOrderPrototype, "verify", Post, ":id/verify", [CsrfGuard], [[Req, 0], [() => Param("id"), 1], [Body, 2], [Res, 3]]);
applyRoute(customerOrderPrototype, "cancel", Post, ":id/cancel", [CsrfGuard], [[Req, 0], [() => Param("id"), 1], [Res, 2]]);

class AdminOrderController {
  constructor(orders) {
    this.orders = orders;
  }

  async listOrders(query, response) {
    response.status(200).json({ data: await this.orders.listAdminOrders(query) });
  }

  async updateOrder(id, body, response) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, "status")
    ) {
      throw new BadRequestException("Provide only an order status.");
    }
    response.status(200).json({
      data: await this.orders.updateAdminStatus(id, body?.status)
    });
  }

  async listPayments(query, response) {
    response.status(200).json(await this.orders.listAdminPayments(query));
  }
}

class ManagerOrderController {
  constructor(orders, prismaService) {
    this.orders = orders;
    this.prisma = prismaService.client;
  }

  async list(request, query, response) {
    const permissions = request.user.role === "INVENTORY_MANAGER"
      ? (await this.prisma.inventorymanagerpermission.findMany({
          where: { userId: request.user.id },
          select: { permission: true }
        })).map(({ permission }) => permission)
      : [];
    if (!permissions.includes("VIEW_ORDERS")) {
      throw new ForbiddenException("You do not have permission to view orders.");
    }
    response.status(200).json(
      await this.orders.listManagerOrders(
        request.user.id,
        permissions.includes("VIEW_ORDER_DETAILS"),
        query
      )
    );
  }
}

Inject(OrderService)(AdminOrderController, undefined, 0);
Controller("admin")(AdminOrderController);
UseGuards(SessionAuthGuard, AdminOnlyGuard)(AdminOrderController);
const adminOrderPrototype = AdminOrderController.prototype;
applyRoute(adminOrderPrototype, "listOrders", Get, "orders", [], [[Query, 0], [Res, 1]]);
applyRoute(adminOrderPrototype, "updateOrder", Patch, "orders/:id/status", [CsrfGuard], [[() => Param("id"), 0], [Body, 1], [Res, 2]]);
applyRoute(adminOrderPrototype, "listPayments", Get, "payments", [], [[Query, 0], [Res, 1]]);

Inject(OrderService)(ManagerOrderController, undefined, 0);
Inject(require("../prisma/prisma.service").PrismaService)(ManagerOrderController, undefined, 1);
Controller("manager/orders")(ManagerOrderController);
UseGuards(SessionAuthGuard, ManagerOnlyGuard)(ManagerOrderController);
applyRoute(
  ManagerOrderController.prototype,
  "list",
  Get,
  "",
  [],
  [[Req, 0], [Query, 1], [Res, 2]]
);

class RazorpayWebhookController {
  constructor(orders) {
    this.orders = orders;
  }

  async receive(request, body, response) {
    const result = await this.orders.handleWebhook(
      request.rawBody,
      request.get("x-razorpay-signature"),
      request.get("x-razorpay-event-id"),
      body
    );
    response.status(200).json({ data: result });
  }
}

Inject(OrderService)(RazorpayWebhookController, undefined, 0);
Controller("payments/razorpay")(RazorpayWebhookController);
applyRoute(
  RazorpayWebhookController.prototype,
  "receive",
  Post,
  "webhook",
  [],
  [[Req, 0], [Body, 1], [Res, 2]]
);

module.exports = {
  AdminOrderController,
  CustomerOrderController,
  ManagerOrderController,
  RazorpayWebhookController
};
