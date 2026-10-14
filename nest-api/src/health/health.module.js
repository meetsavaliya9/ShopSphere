const { Module } = require("@nestjs/common");
const { HealthController } = require("./health.controller");

class HealthModule {}

Module({ controllers: [HealthController] })(HealthModule);

module.exports = { HealthModule };
