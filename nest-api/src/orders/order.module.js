const { Module } = require("@nestjs/common");
const { AuthModule } = require("../auth/auth.module");
const { CustomerRoleGuard } = require("../cart/cart.controller");
const { AdminOnlyGuard, ManagerOnlyGuard } = require("../products/product.controller");
const { PrismaModule } = require("../prisma/prisma.module");
const {
  AdminOrderController,
  CustomerOrderController,
  ManagerOrderController,
  RazorpayWebhookController
} = require("./order.controller");
const { OrderService } = require("./order.service");

class OrderModule {}

Module({
  imports: [AuthModule, PrismaModule],
  controllers: [
    CustomerOrderController,
    AdminOrderController,
    ManagerOrderController,
    RazorpayWebhookController
  ],
  providers: [OrderService, CustomerRoleGuard, AdminOnlyGuard, ManagerOnlyGuard]
})(OrderModule);

module.exports = { OrderModule };
