const {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} = require("@nestjs/common");
const { SessionAuthGuard, CsrfGuard } = require("../auth/auth-security");
const { AdminOnlyGuard, ManagerOnlyGuard } = require("../products/product.controller");
const { PrismaService } = require("../prisma/prisma.service");
const { AdminService } = require("./admin.service");
const { ForbiddenException } = require("@nestjs/common");

class AdminController {
  constructor(admin) {
    this.admin = admin;
  }

  async overview(query, response) {
    response.status(200).json({ data: await this.admin.overview(query) });
  }

  async reports(query, response) {
    response.status(200).json({ data: await this.admin.reports(query) });
  }

  async databaseInventory(response) {
    response.status(200).json({ data: await this.admin.databaseInventory() });
  }

  async customers(response) {
    response.status(200).json({ data: await this.admin.customers() });
  }

  async customerDetails(id, response) {
    response.status(200).json({ data: await this.admin.customerDetails(id) });
  }

  async updateCustomerStatus(id, body, response) {
    response.status(200).json({
      data: await this.admin.updateCustomerStatus(id, body)
    });
  }

  async coupons(response) {
    response.status(200).json({ data: await this.admin.listCoupons() });
  }

  async createCoupon(body, response) {
    response.status(201).json({ data: await this.admin.createCoupon(body) });
  }

  async updateCoupon(id, body, response) {
    response.status(200).json({ data: await this.admin.updateCoupon(id, body) });
  }

  async deleteCoupon(id, response) {
    response.status(200).json({ data: await this.admin.deleteCoupon(id) });
  }

  async getSettings(response) {
    response.status(200).json({ data: this.admin.getSettings() });
  }

  async updateSettings(body, response) {
    response.status(200).json({ data: this.admin.updateSettings(body) });
  }

  async uploadProductImage(request, response) {
    response.status(201).json({
      data: await this.admin.uploadProductImage(request)
    });
  }

  async deleteProductImage(body, response) {
    response.status(200).json({
      data: await this.admin.deleteProductImage(body)
    });
  }
}

class ManagerProductImageController {
  constructor(admin, prismaService) {
    this.admin = admin;
    this.prisma = prismaService.client;
  }

  async upload(request, response) {
    const permissions = request.user.role === "INVENTORY_MANAGER"
      ? (await this.prisma.inventorymanagerpermission.findMany({
          where: { userId: request.user.id },
          select: { permission: true }
        })).map(({ permission }) => permission)
      : [];
    if (!permissions.includes("UPLOAD_PRODUCT_IMAGES")) {
      throw new ForbiddenException("You do not have permission to upload product images.");
    }
    response.status(201).json({ data: await this.admin.uploadProductImage(request) });
  }
}

Inject(AdminService)(AdminController, undefined, 0);
Controller("admin")(AdminController);
UseGuards(SessionAuthGuard, AdminOnlyGuard)(AdminController);
Inject(AdminService)(ManagerProductImageController, undefined, 0);
Inject(PrismaService)(ManagerProductImageController, undefined, 1);
Controller("manager/products/image")(ManagerProductImageController);
UseGuards(SessionAuthGuard, ManagerOnlyGuard, CsrfGuard)(ManagerProductImageController);

const prototype = AdminController.prototype;
function route(method, decorator, path, guards, parameters) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  decorator(path)(prototype, method, descriptor);
  if (guards.length) UseGuards(...guards)(prototype, method, descriptor);
  for (const [factory, index] of parameters) factory()(prototype, method, index);
}

route("overview", Get, "overview", [], [[Query, 0], [Res, 1]]);
route("reports", Get, "reports", [], [[Query, 0], [Res, 1]]);
route("databaseInventory", Get, "database-inventory", [], [[Res, 0]]);
route("customers", Get, "customers", [], [[Res, 0]]);
route("customerDetails", Get, "customers/:id", [], [[Param, 0], [Res, 1]]);
route("updateCustomerStatus", Patch, "customers/:id/status", [CsrfGuard], [[Param, 0], [Body, 1], [Res, 2]]);
route("coupons", Get, "coupons", [], [[Res, 0]]);
route("createCoupon", Post, "coupons", [CsrfGuard], [[Body, 0], [Res, 1]]);
route("updateCoupon", Patch, "coupons/:id", [CsrfGuard], [[Param, 0], [Body, 1], [Res, 2]]);
route("deleteCoupon", Delete, "coupons/:id", [CsrfGuard], [[Param, 0], [Res, 1]]);
route("getSettings", Get, "settings", [], [[Res, 0]]);
route("updateSettings", Patch, "settings", [CsrfGuard], [[Body, 0], [Res, 1]]);
route("uploadProductImage", Post, "products/image", [CsrfGuard], [[Req, 0], [Res, 1]]);
route("deleteProductImage", Delete, "products/image", [CsrfGuard], [[Body, 0], [Res, 1]]);

const managerImageDescriptor = Object.getOwnPropertyDescriptor(
  ManagerProductImageController.prototype,
  "upload"
);
Post()(ManagerProductImageController.prototype, "upload", managerImageDescriptor);
UseGuards(CsrfGuard)(ManagerProductImageController.prototype, "upload", managerImageDescriptor);
Req()(ManagerProductImageController.prototype, "upload", 0);
Res()(ManagerProductImageController.prototype, "upload", 1);

module.exports = { AdminController, ManagerProductImageController };
