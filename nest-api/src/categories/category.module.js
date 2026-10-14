const { Module } = require("@nestjs/common");
const { AuthModule } = require("../auth/auth.module");
const { PrismaModule } = require("../prisma/prisma.module");
const { AdminRoleGuard, CategoryController, ManagerCategoryController, ManagerRoleGuard } = require("./category.controller");
const { CategoryService } = require("./category.service");

class CategoryModule {}

Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CategoryController, ManagerCategoryController],
  providers: [CategoryService, AdminRoleGuard, ManagerRoleGuard]
})(CategoryModule);

module.exports = { CategoryModule };
