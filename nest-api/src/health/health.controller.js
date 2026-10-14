const { Controller, Get, Res } = require("@nestjs/common");

class HealthController {
  check(response) {
    response.status(200).json({
      data: { status: "ok", application: "ShopSphere NestJS API" }
    });
  }
}

Controller("health")(HealthController);
const descriptor = Object.getOwnPropertyDescriptor(
  HealthController.prototype,
  "check"
);
Get()(HealthController.prototype, "check", descriptor);
Res()(HealthController.prototype, "check", 0);

module.exports = { HealthController };
