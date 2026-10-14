const { Module } = require("@nestjs/common");
const { AuthModule } = require("../auth/auth.module");
const { PrismaModule } = require("../prisma/prisma.module");
const { CartController } = require("./cart.controller");
const { CartService } = require("./cart.service");

class CartModule {}

Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CartController],
  providers: [CartService]
})(CartModule);

module.exports = { CartModule };
