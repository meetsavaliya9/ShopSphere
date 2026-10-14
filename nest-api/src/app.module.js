const { Module } = require("@nestjs/common");
const { AuthModule } = require("./auth/auth.module");
const { CategoryModule } = require("./categories/category.module");
const { HealthModule } = require("./health/health.module");
const { PrismaModule } = require("./prisma/prisma.module");
const { ProductModule } = require("./products/product.module");
const { CartModule } = require("./cart/cart.module");
const { WishlistModule } = require("./wishlist/wishlist.module");
const { OrderModule } = require("./orders/order.module");
const { AdminModule } = require("./admin/admin.module");

class AppModule {}

Module({
  imports: [
    PrismaModule,
    AuthModule,
    CategoryModule,
    HealthModule,
    ProductModule,
    CartModule,
    WishlistModule,
    OrderModule,
    AdminModule
  ]
})(AppModule);

module.exports = { AppModule };
