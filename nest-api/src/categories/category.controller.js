const {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ConflictException,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} = require("@nestjs/common");
const { CsrfGuard, SessionAuthGuard } = require("../auth/auth-security");
const { PrismaService } = require("../prisma/prisma.service");
const { CategoryService, toSlug } = require("./category.service");

const ALLOWED_FIELDS = new Set(["name", "slug", "description"]);

function validateCategory(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("A category object is required.");
  }
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    throw new BadRequestException("Only name, slug, and description are accepted.");
  }

  const result = {};
  if (!partial || Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
      throw new BadRequestException("Category name is required and must be at most 100 characters.");
    }
    result.name = body.name.trim();
  }

  if (!partial || Object.hasOwn(body, "slug")) {
    if (body.slug !== undefined && typeof body.slug !== "string") {
      throw new BadRequestException("Slug must be text.");
    }
    const slug = body.slug === undefined ? toSlug(result.name || body.name) : body.slug.trim();
    if (
      typeof slug !== "string" ||
      !slug ||
      slug.length > 120 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ) {
      throw new BadRequestException("Slug must contain lowercase letters, numbers, and single hyphens.");
    }
    result.slug = slug;
  }

  if (Object.hasOwn(body, "description")) {
    if (body.description !== null && typeof body.description !== "string") {
      throw new BadRequestException("Description must be text.");
    }
    const description = body.description?.trim() || null;
    if (description && description.length > 500) {
      throw new BadRequestException("Description must be at most 500 characters.");
    }
    result.description = description;
  } else if (!partial) {
    result.description = null;
  }

  if (partial && Object.keys(result).length === 0) {
    throw new BadRequestException("Provide at least one category field to update.");
  }
  return result;
}

class AdminRoleGuard {
  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    if (request.user?.role !== "ADMIN") {
      throw new ForbiddenException("Administrator access required.");
    }
    return true;
  }
}

class ManagerRoleGuard {
  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    if (!["MANAGER", "INVENTORY_MANAGER"].includes(request.user?.role)) {
      throw new ForbiddenException("Manager access required.");
    }
    return true;
  }
}

Injectable()(ManagerRoleGuard);

Injectable()(AdminRoleGuard);

class CategoryController {
  constructor(categories) {
    this.categories = categories;
  }

  async list(response) {
    response.status(200).json({ data: await this.categories.list() });
  }

  async create(body, response) {
    response.status(201).json({
      data: await this.categories.create(validateCategory(body))
    });
  }

  async update(id, body, response) {
    response.status(200).json({
      data: await this.categories.update(id, validateCategory(body, true))
    });
  }

  async updateLegacy(name, body, response) {
    response.status(200).json({
      data: await this.categories.updateLegacy(name, validateCategory(body))
    });
  }

  async remove(id, response) {
    response.status(200).json({
      data: await this.categories.remove(id)
    });
  }

  async removeLegacy(name, response) {
    response.status(200).json({
      data: await this.categories.removeLegacy(name)
    });
  }
}

class ManagerCategoryController {
  constructor(categories, prismaService) {
    this.categories = categories;
    this.prisma = prismaService.client;
  }

  async permissions(request) {
    if (request.user.role !== "INVENTORY_MANAGER") return [];
    const rows = await this.prisma.inventorymanagerpermission.findMany({
      where: { userId: request.user.id },
      select: { permission: true }
    });
    return rows.map(({ permission }) => permission);
  }

  async list(request, query, response) {
    const permissions = await this.permissions(request);
    if (!permissions.includes("VIEW_CATEGORIES") && !permissions.includes("MANAGE_CATEGORIES")) {
      throw new ForbiddenException("You do not have permission to view categories.");
    }
    const result = await this.categories.list(query);
    response.status(200).json(result);
  }

  async create(request, body, response) {
    if (!(await this.permissions(request)).includes("MANAGE_CATEGORIES")) {
      throw new ForbiddenException("You do not have permission to manage categories.");
    }
    response.status(201).json({ data: await this.categories.create(validateCategory(body)) });
  }

  async update(request, id, body, response) {
    if (!(await this.permissions(request)).includes("MANAGE_CATEGORIES")) {
      throw new ForbiddenException("You do not have permission to manage categories.");
    }
    if (body && typeof body.name === "string") {
      const category = await this.prisma.category.findUnique({
        where: { id: Number(id) },
        select: { name: true }
      });
      if (category && category.name !== body.name.trim()) {
        const otherManagerProducts = await this.prisma.product.count({
          where: {
            category: category.name,
            OR: [
              { managerId: { not: request.user.id } },
              { managerId: null }
            ]
          }
        });
        if (otherManagerProducts > 0) {
          throw new ConflictException(
            "This category is used by products outside your inventory and cannot be renamed."
          );
        }
      }
    }
    response.status(200).json({ data: await this.categories.update(id, validateCategory(body, true)) });
  }

  async remove(request, id, response) {
    if (!(await this.permissions(request)).includes("MANAGE_CATEGORIES")) {
      throw new ForbiddenException("You do not have permission to manage categories.");
    }
    response.status(200).json({ data: await this.categories.remove(id) });
  }
}

Inject(CategoryService)(CategoryController, undefined, 0);
Controller("admin/categories")(CategoryController);
UseGuards(SessionAuthGuard, AdminRoleGuard)(CategoryController);
Inject(CategoryService)(ManagerCategoryController, undefined, 0);
Inject(PrismaService)(ManagerCategoryController, undefined, 1);
Controller("manager/categories")(ManagerCategoryController);
UseGuards(SessionAuthGuard, ManagerRoleGuard)(ManagerCategoryController);

const prototype = CategoryController.prototype;
const listDescriptor = Object.getOwnPropertyDescriptor(prototype, "list");
Get()(prototype, "list", listDescriptor);
Res()(prototype, "list", 0);
const createDescriptor = Object.getOwnPropertyDescriptor(prototype, "create");
Post()(prototype, "create", createDescriptor);
UseGuards(CsrfGuard)(prototype, "create", createDescriptor);
Body()(prototype, "create", 0);
Res()(prototype, "create", 1);
const updateDescriptor = Object.getOwnPropertyDescriptor(prototype, "update");
Patch(":id")(prototype, "update", updateDescriptor);
UseGuards(CsrfGuard)(prototype, "update", updateDescriptor);
Param("id")(prototype, "update", 0);
Body()(prototype, "update", 1);
Res()(prototype, "update", 2);
const updateLegacyDescriptor = Object.getOwnPropertyDescriptor(prototype, "updateLegacy");
Patch("legacy/:name")(prototype, "updateLegacy", updateLegacyDescriptor);
UseGuards(CsrfGuard)(prototype, "updateLegacy", updateLegacyDescriptor);
Param("name")(prototype, "updateLegacy", 0);
Body()(prototype, "updateLegacy", 1);
Res()(prototype, "updateLegacy", 2);
const removeDescriptor = Object.getOwnPropertyDescriptor(prototype, "remove");
Delete(":id")(prototype, "remove", removeDescriptor);
UseGuards(CsrfGuard)(prototype, "remove", removeDescriptor);
Param("id")(prototype, "remove", 0);
Res()(prototype, "remove", 1);
const removeLegacyDescriptor = Object.getOwnPropertyDescriptor(prototype, "removeLegacy");
Delete("legacy/:name")(prototype, "removeLegacy", removeLegacyDescriptor);
UseGuards(CsrfGuard)(prototype, "removeLegacy", removeLegacyDescriptor);
Param("name")(prototype, "removeLegacy", 0);
Res()(prototype, "removeLegacy", 1);

module.exports = { AdminRoleGuard, CategoryController, ManagerCategoryController, ManagerRoleGuard, validateCategory };

const managerPrototype = ManagerCategoryController.prototype;
function managerRoute(method, decorator, path, guards, parameters) {
  const descriptor = Object.getOwnPropertyDescriptor(managerPrototype, method);
  decorator(path)(managerPrototype, method, descriptor);
  if (guards.length) UseGuards(...guards)(managerPrototype, method, descriptor);
  for (const [factory, index] of parameters) factory()(managerPrototype, method, index);
}
managerRoute("list", Get, "", [], [[Req, 0], [Query, 1], [Res, 2]]);
managerRoute("create", Post, "", [CsrfGuard], [[Req, 0], [Body, 1], [Res, 2]]);
managerRoute("update", Patch, ":id", [CsrfGuard], [[Req, 0], [() => Param("id"), 1], [Body, 2], [Res, 3]]);
managerRoute("remove", Delete, ":id", [CsrfGuard], [[Req, 0], [() => Param("id"), 1], [Res, 2]]);
