const {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards
} = require("@nestjs/common");
const { AuthRateLimitGuard, AuthSecurity, CsrfGuard, SessionAuthGuard, sessionCookieName } = require("./auth-security");
const { AuthService } = require("./auth.service");

const MAX_PASSWORD_BYTES = 1024;

function validPassword(password) {
  return typeof password === "string" &&
    Array.from(password).length >= 8 &&
    Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}

function validateRegistration(body) {
  const { name, email, password } = body || {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    throw new BadRequestException("name must be a non-empty string of at most 100 characters");
  }
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    throw new BadRequestException("email must be a valid email address");
  }
  if (!validPassword(password)) {
    throw new BadRequestException("password must be at least 8 characters and no more than 1024 UTF-8 bytes");
  }
  return { name: name.trim(), email: email.trim(), password };
}

function validateLogin(body) {
  const { email, password } = body || {};
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    typeof password !== "string" ||
    Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
  ) {
    throw new BadRequestException("Invalid email or password");
  }
  return { email: email.trim(), password };
}

function validateOtp(body, allowCode) {
  const allowedKeys = allowCode ? ["challengeId", "code"] : ["challengeId"];
  if (
    !body ||
    Object.keys(body).some((key) => !allowedKeys.includes(key)) ||
    Object.keys(body).length !== allowedKeys.length ||
    typeof body.challengeId !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.challengeId) ||
    (allowCode && (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)))
  ) {
    throw new BadRequestException(
      allowCode
        ? "Provide a valid verification request and 6-digit code"
        : "Provide a valid verification request"
    );
  }
  return allowCode
    ? { challengeId: body.challengeId, code: body.code }
    : { challengeId: body.challengeId };
}

function validateProfile(body) {
  if (
    !body ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "name") ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 100
  ) {
    throw new BadRequestException("Only a valid display name can be updated");
  }
  return { name: body.name.trim() };
}

function validatePasswordChange(body) {
  const { currentPassword, newPassword } = body || {};
  if (
    !body ||
    Object.keys(body).some((key) => !["currentPassword", "newPassword"].includes(key)) ||
    typeof currentPassword !== "string" ||
    !currentPassword ||
    Buffer.byteLength(currentPassword, "utf8") > MAX_PASSWORD_BYTES ||
    !validPassword(newPassword)
  ) {
    throw new BadRequestException(
      "Provide the current password and a new password of at least 8 characters and no more than 1024 UTF-8 bytes"
    );
  }
  return { currentPassword, newPassword };
}

class AuthController {
  constructor(authService, security) {
    this.authService = authService;
    this.security = security;
  }

  csrf(request, response) {
    const csrfToken = this.security.issueCsrfToken(request, response);
    response.status(200).json({ data: { csrfToken } });
  }

  async register(request, response, body) {
    const result = await this.authService.register(validateRegistration(body));
    await this.authService.revokeSession(request.cookies?.[sessionCookieName()]);
    this.security.clearCookie(response, sessionCookieName());
    const csrfToken = this.security.issueCsrfToken(request, response);
    response.status(result.challengeId ? 202 : 200).json({
      data: { message: result.message, challengeId: result.challengeId, csrfToken }
    });
  }

  async login(request, response, body) {
    const result = await this.authService.login(validateLogin(body));
    await this.authService.revokeSession(request.cookies?.[sessionCookieName()]);
    if (result.requiresEmailVerification) {
      this.security.clearCookie(response, sessionCookieName());
      response.status(202).json({
        data: {
          requiresEmailVerification: true,
          challengeId: result.challengeId
        }
      });
      return;
    }
    this.respondWithSession(request, response, result, 200);
  }

  async verifyOtp(request, response, body) {
    const result = await this.authService.verifyOtp(validateOtp(body, true));
    await this.authService.revokeSession(request.cookies?.[sessionCookieName()]);
    this.respondWithSession(request, response, result, 200);
  }

  async resendOtp(body, response) {
    const result = await this.authService.resendOtp(validateOtp(body, false));
    response.status(200).json({ data: result });
  }

  async logout(request, response) {
    await this.authService.revokeSession(request.cookies?.[sessionCookieName()]);
    this.security.clearCookie(response, sessionCookieName());
    const csrfToken = this.security.issueCsrfToken(request, response);
    response.status(200).json({ data: { loggedOut: true, csrfToken } });
  }

  me(request, response) {
    response.status(200).json({ data: request.user });
  }

  async updateMe(request, response, body) {
    const user = await this.authService.updateProfile(request.user.id, validateProfile(body));
    response.status(200).json({ data: user });
  }

  async changePassword(request, response, body) {
    await this.authService.changePassword(
      request.user.id,
      validatePasswordChange(body)
    );
    this.security.clearCookie(response, sessionCookieName());
    const csrfToken = this.security.issueCsrfToken(request, response);
    response.status(200).json({ data: { passwordChanged: true, csrfToken } });
  }

  respondWithSession(request, response, result, statusCode) {
    this.security.setCookie(response, sessionCookieName(), result.token);
    const csrfToken = this.security.issueCsrfToken(request, response);
    response.status(statusCode).json({ data: { user: result.user, csrfToken } });
  }
}

Inject(AuthService)(AuthController, undefined, 0);
Inject(AuthSecurity)(AuthController, undefined, 1);
Controller("auth")(AuthController);

const prototype = AuthController.prototype;
function route(method, decorator, path, guards, parameters) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  decorator(path)(prototype, method, descriptor);
  if (guards.length) UseGuards(...guards)(prototype, method, descriptor);
  for (const [decoratorFactory, index] of parameters) {
    decoratorFactory()(prototype, method, index);
  }
}

route("csrf", Get, "csrf", [], [[Req, 0], [Res, 1]]);
route("register", Post, "register", [CsrfGuard, AuthRateLimitGuard], [[Req, 0], [Res, 1], [Body, 2]]);
route("login", Post, "login", [AuthRateLimitGuard, CsrfGuard], [[Req, 0], [Res, 1], [Body, 2]]);
route("verifyOtp", Post, "verify-otp", [CsrfGuard, AuthRateLimitGuard], [[Req, 0], [Res, 1], [Body, 2]]);
route("resendOtp", Post, "resend-otp", [CsrfGuard, AuthRateLimitGuard], [[Body, 0], [Res, 1]]);
route("logout", Post, "logout", [CsrfGuard], [[Req, 0], [Res, 1]]);
route("me", Get, "me", [SessionAuthGuard], [[Req, 0], [Res, 1]]);
route("updateMe", Patch, "me", [SessionAuthGuard, CsrfGuard], [[Req, 0], [Res, 1], [Body, 2]]);
route("changePassword", Patch, "me/password", [SessionAuthGuard, CsrfGuard], [[Req, 0], [Res, 1], [Body, 2]]);

module.exports = { AuthController };
