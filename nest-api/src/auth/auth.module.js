const { Module } = require("@nestjs/common");
const { PrismaModule } = require("../prisma/prisma.module");
const { AuthController } = require("./auth.controller");
const {
  AUTH_SERVICE_OPTIONS,
  AuthService
} = require("./auth.service");
const {
  AuthRateLimitGuard,
  AuthSecurity,
  CsrfGuard,
  SessionAuthGuard
} = require("./auth-security");

class AuthModule {}

Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSecurity,
    CsrfGuard,
    SessionAuthGuard,
    AuthRateLimitGuard,
    { provide: AUTH_SERVICE_OPTIONS, useValue: {} }
  ],
  exports: [AuthService, AuthSecurity, SessionAuthGuard, CsrfGuard]
})(AuthModule);

module.exports = { AuthModule };
