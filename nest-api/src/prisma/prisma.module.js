const { Module } = require("@nestjs/common");
const { PrismaService } = require("./prisma.service");

class PrismaModule {}

Module({
  providers: [PrismaService],
  exports: [PrismaService]
})(PrismaModule);

module.exports = { PrismaModule };
