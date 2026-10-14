const {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Param,
  Post,
  Req,
  Res,
  UseGuards
} = require("@nestjs/common");
const { CsrfGuard, SessionAuthGuard } = require("../auth/auth-security");
const { WishlistService } = require("./wishlist.service");

class WishlistCustomerGuard {
  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    if (request.user?.role !== "CUSTOMER") {
      throw new ForbiddenException("Customer access required.");
    }
    return true;
  }
}

Injectable()(WishlistCustomerGuard);

class WishlistController {
  constructor(wishlist) {
    this.wishlist = wishlist;
  }

  async list(request, response) {
    response.status(200).json({
      data: await this.wishlist.list(request.user.id)
    });
  }

  async add(request, body, response) {
    response.status(200).json({
      data: await this.wishlist.add(request.user.id, body)
    });
  }

  async remove(request, id, response) {
    response.status(200).json({
      data: await this.wishlist.remove(request.user.id, id)
    });
  }
}

Inject(WishlistService)(WishlistController, undefined, 0);
Controller("wishlist")(WishlistController);
UseGuards(SessionAuthGuard, WishlistCustomerGuard)(WishlistController);

const prototype = WishlistController.prototype;
function route(method, decorator, path, guards, parameters) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  decorator(path)(prototype, method, descriptor);
  if (guards.length) UseGuards(...guards)(prototype, method, descriptor);
  for (const [factory, index] of parameters) factory()(prototype, method, index);
}

route("list", Get, "", [], [[Req, 0], [Res, 1]]);
route("add", Post, "items", [CsrfGuard], [[Req, 0], [Body, 1], [Res, 2]]);
route("remove", Delete, "items/:productId", [CsrfGuard], [[Req, 0], [() => Param("productId"), 1], [Res, 2]]);

module.exports = { WishlistController, WishlistCustomerGuard };
