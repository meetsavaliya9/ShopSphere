const { Module } = require("@nestjs/common");
const { AuthModule } = require("../auth/auth.module");
const { PrismaModule } = require("../prisma/prisma.module");
const { WishlistController } = require("./wishlist.controller");
const { WishlistService } = require("./wishlist.service");

class WishlistModule {}

Module({
  imports: [AuthModule, PrismaModule],
  controllers: [WishlistController],
  providers: [WishlistService]
})(WishlistModule);

module.exports = { WishlistModule };
