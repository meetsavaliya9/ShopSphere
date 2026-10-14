const {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards
} = require("@nestjs/common");
const { CsrfGuard, SessionAuthGuard } = require("../auth/auth-security");
const { CartService } = require("./cart.service");

class CustomerRoleGuard {
  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    if (request.user?.role !== "CUSTOMER") {
      throw new ForbiddenException("Customer access required.");
    }
    return true;
  }
}

Injectable()(CustomerRoleGuard);

class CartController {
  constructor(cart) {
    this.cart = cart;
  }

  async get(request, response) {
    response.status(200).json({ data: await this.cart.get(request.user.id) });
  }

  async add(request, body, response) {
    response.status(200).json({ data: await this.cart.add(request.user.id, body) });
  }

  async update(request, id, body, response) {
    response.status(200).json({
      data: await this.cart.update(request.user.id, id, body)
    });
  }

  async remove(request, id, response) {
    response.status(200).json({
      data: await this.cart.remove(request.user.id, id)
    });
  }
}

Inject(CartService)(CartController, undefined, 0);
Controller("cart")(CartController);
UseGuards(SessionAuthGuard, CustomerRoleGuard)(CartController);

const prototype = CartController.prototype;
function route(method, decorator, path, guards, parameters) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  decorator(path)(prototype, method, descriptor);
  if (guards.length) UseGuards(...guards)(prototype, method, descriptor);
  for (const [factory, index] of parameters) factory()(prototype, method, index);
}

route("get", Get, "", [], [[Req, 0], [Res, 1]]);
route("add", Post, "items", [CsrfGuard], [[Req, 0], [Body, 1], [Res, 2]]);
route("update", Patch, "items/:productId", [CsrfGuard], [[Req, 0], [() => Param("productId"), 1], [Body, 2], [Res, 3]]);
route("remove", Delete, "items/:productId", [CsrfGuard], [[Req, 0], [() => Param("productId"), 1], [Res, 2]]);

module.exports = { CartController, CustomerRoleGuard };
