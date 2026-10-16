const {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException
} = require("@nestjs/common");
const { PrismaService } = require("../prisma/prisma.service");

function toSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

function duplicateError(error) {
  if (error?.code === "P2002") {
    throw new ConflictException("A category with that name or slug already exists.");
  }
  throw error;
}

class CategoryService {
  constructor(prismaService) {
    this.prisma = prismaService.client;
  }

  async list(query = {}) {
    const page = this.parseInteger(query.page, 1, 1, 1_000_000, "page");
    const limit = this.parseInteger(query.limit, 10, 1, 100, "limit");
    const skip = (page - 1) * limit;

    const [savedCategories, products, total] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { name: "asc" } }),
      this.prisma.product.findMany({
        select: {
          category: true,
          price: true,
          inStock: true
        }
      }),
      this.prisma.category.count()
    ]);

    const counts = new Map();
    for (const product of products) {
      const name = product.category || "Uncategorized";
      const current = counts.get(name) || {
        productCount: 0,
        inStockCount: 0,
        totalValue: 0
      };
      current.productCount += 1;
      if (product.inStock) current.inStockCount += 1;
      current.totalValue += Number(product.price || 0);
      counts.set(name, current);
    }

    const categories = new Map(
      savedCategories.map((category) => [
        category.name,
        {
          ...category,
          productCount: 0,
          inStockCount: 0,
          totalValue: 0
        }
      ])
    );

    for (const [name, productStats] of counts) {
      const saved = categories.get(name);
      categories.set(name, {
        ...(saved || {
          id: null,
          name,
          slug: toSlug(name),
          description: null
        }),
        ...productStats,
        totalValue: Math.round(productStats.totalValue * 100) / 100
      });
    }

    const allCategories = [...categories.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    const paginatedCategories = allCategories.slice(skip, skip + limit);

    return {
      data: paginatedCategories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  parseInteger(value, fallback, minimum, maximum, field) {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new BadRequestException(`${field} must be between ${minimum} and ${maximum}.`);
    }
    return parsed;
  }

  async create(input) {
    const slug = input.slug || toSlug(input.name);
    if (!slug) throw new BadRequestException("Provide a slug containing letters or numbers.");
    try {
      return await this.prisma.category.create({
        data: {
          name: input.name,
          slug,
          description: input.description || null,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      duplicateError(error);
    }
  }

  async update(id, input) {
    const categoryId = this.parseId(id);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.category.findUnique({
          where: { id: categoryId }
        });
        if (!current) throw new NotFoundException("Category not found.");

        const data = { ...input, updatedAt: new Date() };
        if (Object.hasOwn(data, "name") && data.name !== current.name) {
          await transaction.product.updateMany({
            where: { category: current.name },
            data: { category: data.name, updatedAt: data.updatedAt }
          });
        }

        return transaction.category.update({
          where: { id: categoryId },
          data
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      duplicateError(error);
    }
  }

  async updateLegacy(name, input) {
    if (typeof name !== "string" || !name.trim() || name.length > 100) {
      throw new BadRequestException("Category name is invalid.");
    }
    const currentName = name.trim();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.category.findUnique({
          where: { name: currentName }
        });
        if (existing) {
          throw new ConflictException("This category is already managed as a saved category.");
        }

        const productCount = await transaction.product.count({
          where: { category: currentName }
        });
        if (productCount === 0) throw new NotFoundException("Product category not found.");

        const updatedAt = new Date();
        const category = await transaction.category.create({
          data: {
            name: input.name,
            slug: input.slug || toSlug(input.name),
            description: input.description || null,
            updatedAt
          }
        });
        await transaction.product.updateMany({
          where: { category: currentName },
          data: { category: category.name, updatedAt }
        });
        return category;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      duplicateError(error);
    }
  }

  async remove(id) {
    const categoryId = this.parseId(id);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.category.findUnique({
          where: { id: categoryId }
        });
        if (!category) throw new NotFoundException("Category not found.");
        const productCount = await transaction.product.count({
          where: { category: category.name }
        });
        if (productCount > 0) {
          throw new ConflictException(
            "This category is assigned to products. Reassign those products before deleting it."
          );
        }
        await transaction.category.delete({ where: { id: categoryId } });
        return { deleted: true };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      duplicateError(error);
    }
  }

  async removeLegacy(name) {
    if (typeof name !== "string" || !name.trim() || name.length > 100) {
      throw new BadRequestException("Category name is invalid.");
    }
    const categoryName = name.trim();
    const productCount = await this.prisma.product.count({
      where: { category: categoryName }
    });
    if (productCount > 0) {
      throw new ConflictException(
        "This category is assigned to products. Reassign those products before deleting it."
      );
    }
    const category = await this.prisma.category.findUnique({
      where: { name: categoryName }
    });
    if (category) return this.remove(String(category.id));
    throw new NotFoundException("Product category not found.");
  }

  parseId(value) {
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value))) {
      throw new BadRequestException("Category ID is invalid.");
    }
    return Number(value);
  }
}

Inject(PrismaService)(CategoryService, undefined, 0);
Injectable()(CategoryService);

module.exports = { CategoryService, toSlug };
