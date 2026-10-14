const {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException
} = require("@nestjs/common");
const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const { AuthService } = require("./auth.service");

const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const CSRF_LIFETIME_SECONDS = SESSION_LIFETIME_SECONDS;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function sessionCookieName() {
  return isProduction() ? "__Host-shopsphere_session" : "shopsphere_session";
}

function csrfCookieName() {
  return isProduction() ? "__Host-shopsphere_csrf" : "shopsphere_csrf";
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length > 0 &&
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

class AuthSecurity {
  constructor(secret = process.env.CSRF_SECRET) {
    if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
      throw new Error("CSRF_SECRET must contain at least 32 characters");
    }
    this.secret = secret;
  }

  sign(value) {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  isValidToken(token) {
    if (typeof token !== "string") return false;
    const [nonce, signature, ...extra] = token.split(".");
    return Boolean(
      nonce &&
      signature &&
      extra.length === 0 &&
      safeEqual(signature, this.sign(nonce))
    );
  }

  issueCsrfToken(request, response) {
    const name = csrfCookieName();
    const previous = request.cookies?.[name];
    if (this.isValidToken(previous)) return previous;
    const nonce = randomBytes(32).toString("base64url");
    const token = `${nonce}.${this.sign(nonce)}`;
    this.setCookie(response, name, token, {
      httpOnly: false,
      maxAge: CSRF_LIFETIME_SECONDS
    });
    return token;
  }

  setCookie(response, name, value, { httpOnly = true, maxAge = SESSION_LIFETIME_SECONDS } = {}) {
    const pieces = [
      `${name}=${encodeURIComponent(value)}`,
      "Path=/",
      `Max-Age=${maxAge}`,
      "SameSite=Strict"
    ];
    if (httpOnly) pieces.push("HttpOnly");
    if (isProduction()) pieces.push("Secure");
    response.append("Set-Cookie", pieces.join("; "));
  }

  clearCookie(response, name, httpOnly = true) {
    this.setCookie(response, name, "", { httpOnly, maxAge: 0 });
  }

  validateCsrf(request) {
    const token = request.cookies?.[csrfCookieName()];
    const header = request.get("x-csrf-token");
    if (!token || !header || !safeEqual(token, header) || !this.isValidToken(token)) {
      throw new ForbiddenException("Request verification failed. Refresh and try again.");
    }
  }
}

class CsrfGuard {
  constructor(security) {
    this.security = security;
  }

  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    this.security.validateCsrf(request);
    return true;
  }
}

Inject(AuthSecurity)(CsrfGuard, undefined, 0);
Injectable()(CsrfGuard);

class SessionAuthGuard {
  constructor(authService, security) {
    this.authService = authService;
    this.security = security;
  }

  async canActivate(context) {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();
    const token = request.cookies?.[sessionCookieName()];
    if (!token) throw new UnauthorizedException("Authentication required");
    const user = await this.authService.getSessionUser(token);
    if (!user) {
      this.security.clearCookie(response, sessionCookieName());
      throw new UnauthorizedException("Authentication required");
    }
    request.user = user;
    request.sessionToken = token;
    return true;
  }
}

Inject(AuthService)(SessionAuthGuard, undefined, 0);
Inject(AuthSecurity)(SessionAuthGuard, undefined, 1);
Injectable()(SessionAuthGuard);

class AuthRateLimitGuard {
  constructor() {
    this.requests = new Map();
  }

  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    const route = [request.path, request.route?.path, request.originalUrl]
      .find((candidate) => typeof candidate === "string" && candidate.length > 0) || "";
    const endpoint = route.replace(/\/+$/, "").split("/").pop();
    const config = endpoint === "login"
      ? { key: "login", limit: 10, windowMs: 15 * 60 * 1000, message: "Too many authentication attempts. Try again later." }
      : endpoint === "register"
        ? { key: "registration", limit: process.env.NODE_ENV === "production" ? 5 : 20, windowMs: 60 * 60 * 1000, message: "Too many registration attempts. Try again later." }
        : ["verify-otp", "resend-otp"].includes(endpoint)
          ? { key: "otp", limit: 10, windowMs: 15 * 60 * 1000, message: "Too many verification attempts. Try again later." }
          : null;
    if (!config) return true;

    if (config.key === "registration" && !validRegistrationRequest(request.body)) {
      return true;
    }
    if (config.key === "otp" && !validOtpRequest(request.body, endpoint === "verify-otp")) {
      return true;
    }

    const now = Date.now();
    const client = request.ip || request.socket?.remoteAddress || "unknown";
    const mapKey = `${config.key}:${client}`;
    const current = this.requests.get(mapKey);
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + config.windowMs }
      : current;
    entry.count += 1;
    this.requests.set(mapKey, entry);
    if (entry.count > config.limit) {
      throw new HttpException(config.message, 429);
    }
    return true;
  }
}

Injectable()(AuthRateLimitGuard);

function validRegistrationRequest(body) {
  return Boolean(
    body &&
    typeof body.name === "string" &&
    body.name.trim().length > 0 &&
    body.name.trim().length <= 100 &&
    typeof body.email === "string" &&
    body.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) &&
    typeof body.password === "string" &&
    Array.from(body.password).length >= 8 &&
    Buffer.byteLength(body.password, "utf8") <= 1024
  );
}

function validOtpRequest(body, verify) {
  const allowed = verify ? ["challengeId", "code"] : ["challengeId"];
  return Boolean(
    body &&
    Object.keys(body).length === allowed.length &&
    Object.keys(body).every((key) => allowed.includes(key)) &&
    typeof body.challengeId === "string" &&
    /^[a-f0-9]{64}$/.test(body.challengeId) &&
    (!verify || (typeof body.code === "string" && /^\d{6}$/.test(body.code)))
  );
}

module.exports = {
  AuthRateLimitGuard,
  AuthSecurity,
  CsrfGuard,
  SessionAuthGuard,
  csrfCookieName,
  sessionCookieName
};
