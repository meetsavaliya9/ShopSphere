const { Module } = require("@nestjs/common");
const { AuthModule } = require("../auth/auth.module");
const { PrismaModule } = require("../prisma/prisma.module");
const { ProductController } = require("./product.controller");
const { ProductService } = require("./product.service");

class ProductModule {}

Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProductController],
  providers: [ProductService]
})(ProductModule);

module.exports = { ProductModule };
