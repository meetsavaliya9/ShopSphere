const { Module } = require("@nestjs/common");
const { AuthModule } = require("../auth/auth.module");
const { PrismaModule } = require("../prisma/prisma.module");
const { AdminOnlyGuard, ManagerOnlyGuard } = require("../products/product.controller");
const { AdminController, ManagerProductImageController } = require("./admin.controller");
const { AdminService } = require("./admin.service");

class AdminModule {}

Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AdminController, ManagerProductImageController],
  providers: [AdminOnlyGuard, ManagerOnlyGuard, AdminService]
})(AdminModule);

module.exports = { AdminModule };
