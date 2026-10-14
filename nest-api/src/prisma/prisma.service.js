const { Injectable } = require("@nestjs/common");
const { PrismaClient } = require("@prisma/client");

class PrismaService extends PrismaClient {
  constructor() {
    super();
    this.client = this;
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

Injectable()(PrismaService);

module.exports = { PrismaService };
