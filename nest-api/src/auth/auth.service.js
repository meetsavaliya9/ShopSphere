const {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} = require("@nestjs/common");
const bcrypt = require("bcryptjs");
const { createHash, createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const { PrismaService } = require("../prisma/prisma.service");
const { EmailService } = require("./email.service");
const {
  getCustomerPermissions,
  requireCustomerPermission
} = require("./customer-permissions");

const AUTH_SERVICE_OPTIONS = "AUTH_SERVICE_OPTIONS";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const OTP_LIFETIME_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const DUMMY_PASSWORD_HASH = "$2b$12$3NRuvi7YiETgQ6wpERJHOu2OPHZE5CGG38LobG/wkuMxyimF502Ia";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

class AuthService {
  constructor(prismaService, options = {}) {
    this.prisma = prismaService.client;
    this.now = options.now || (() => new Date());
    this.otpSecret = options.otpSecret || process.env.CSRF_SECRET;
    this.emailSender = options.emailSender || new EmailService();
  }

  async register(input) {
    const email = normalizeEmail(input.email);
    let user;
    const startedAt = Date.now();
    console.info("Registration request started:", {
      emailDomain: email.includes("@") ? email.split("@", 2)[1] : "[redacted]",
      purpose: "registration"
    });
    try {
      user = await this.prisma.user.create({
        data: {
          name: input.name.trim(),
          email,
          passwordHash: await bcrypt.hash(input.password, 12),
          role: "CUSTOMER",
          updatedAt: this.now()
        }
      });
      console.info("Registration account persisted:", {
        userId: user.id,
        elapsedMs: Date.now() - startedAt
      });
    } catch (error) {
      if (error?.code === "P2002") throw new ConflictException("An account with this email already exists.");
      console.error("Registration database failure:", {
        emailDomain: email.includes("@") ? email.split("@", 2)[1] : "[redacted]",
        code: error?.code || null,
        message: error?.message || "Unknown database error",
        elapsedMs: Date.now() - startedAt
      });
      throw error;
    }

    try {
      const challenge = await this.createChallenge(user, "registration");
      console.info("Registration challenge created:", {
        userId: user.id,
        challengeId: challenge.id,
        elapsedMs: Date.now() - startedAt
      });
      return {
        message: "A verification code has been sent to your email.",
        challengeId: challenge.id
      };
    } catch (error) {
      await this.prisma.user.delete({ where: { id: user.id } });
      console.error("Registration cleanup after email failure:", {
        userId: user.id,
        elapsedMs: Date.now() - startedAt,
        code: error?.code || null,
        message: error?.message || "Unknown email error"
      });
      throw error;
    }
  }

  async login(input) {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const matches = await comparePassword(
      input.password,
      user?.passwordHash || DUMMY_PASSWORD_HASH
    );
    if (!user || !matches) throw new UnauthorizedException("Invalid email or password");

    if (user.role !== "CUSTOMER") return this.createSession(user);

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (user.otpPurpose === "login") {
      await this.clearOtpChallenge(user.id, user.otpChallengeId);
    }
    const challenge = await this.createChallenge(user, "login");
    return { requiresEmailVerification: true, challengeId: challenge.id };
  }

  async verifyOtp({ challengeId, code }) {
    const challenge = await this.prisma.user.findUnique({
      where: { otpChallengeId: challengeId }
    });
    if (
      !challenge ||
      !challenge.otpExpiresAt ||
      challenge.otpExpiresAt <= this.now() ||
      challenge.otpAttempts >= MAX_OTP_ATTEMPTS
    ) {
      throw new BadRequestException("The verification code is invalid or expired.");
    }

    const suppliedHash = this.hashOtp(challengeId, code);
    if (!challenge.otpCodeHash || !safeEqual(suppliedHash, challenge.otpCodeHash)) {
      const attempts = challenge.otpAttempts + 1;
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await this.clearOtpChallenge(challenge.id, challengeId);
      } else {
        await this.prisma.user.update({
          where: { id: challenge.id },
          data: { otpAttempts: attempts }
        });
      }
      throw new BadRequestException("The verification code is invalid or expired.");
    }

    const user = challenge.otpPurpose === "registration"
      ? await this.prisma.user.update({
          where: { id: challenge.id },
          data: {
            emailVerifiedAt: this.now(),
            ...this.clearedOtpChallenge()
          }
        })
      : await this.prisma.user.update({
          where: { id: challenge.id },
          data: this.clearedOtpChallenge()
        });
    return this.createSession(user);
  }

  async resendOtp({ challengeId }) {
    const user = await this.prisma.user.findUnique({
      where: { otpChallengeId: challengeId }
    });
    if (!user || !user.otpExpiresAt || user.otpExpiresAt <= this.now()) {
      throw new BadRequestException("The verification request is invalid or expired.");
    }
    if (user.otpResendAfter && this.now() < user.otpResendAfter) {
      throw new HttpException("Please wait before requesting another verification code.", 429);
    }
    const replacement = await this.createChallenge(user, user.otpPurpose);
    return {
      message: "A new verification code has been sent to your email.",
      challengeId: replacement.id
    };
  }

  async getSessionUser(token) {
    if (typeof token !== "string" || !token) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: this.hashSessionToken(token) },
      include: { user: true }
    });
    if (!session || session.expiresAt <= this.now()) {
      if (session) await this.prisma.session.delete({ where: { id: session.id } });
      return null;
    }
    return {
      ...publicUser(session.user),
      ...(session.user.role === "CUSTOMER"
        ? { customerPermissions: await getCustomerPermissions(this.prisma) }
        : {})
    };
  }

  async revokeSession(token) {
    if (typeof token !== "string" || !token) return;
    await this.prisma.session.deleteMany({
      where: { id: this.hashSessionToken(token) }
    });
  }

  async updateProfile(userId, input) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    if (existingUser?.role === "CUSTOMER") {
      await requireCustomerPermission(this.prisma, userId, "EDIT_PROFILE");
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: input.name.trim() }
    });
    return {
      ...publicUser(user),
      ...(user.role === "CUSTOMER"
        ? { customerPermissions: await getCustomerPermissions(this.prisma) }
        : {})
    };
  }

  async changePassword(userId, input) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Account not found.");
    if (user.role === "CUSTOMER") {
      await requireCustomerPermission(this.prisma, userId, "CHANGE_PASSWORD");
    }
    if (!(await comparePassword(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("The current password is incorrect.");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(input.newPassword, 12) }
    });
    await this.prisma.session.deleteMany({ where: { userId } });
    return { passwordChanged: true };
  }

  async createChallenge(user, purpose) {
    if (!this.otpSecret || Buffer.byteLength(this.otpSecret) < 32) {
      throw new ServiceUnavailableException("Email verification is unavailable.");
    }
    const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
    const id = randomBytes(32).toString("hex");
    const now = this.now();
    const expiresAt = new Date(now.getTime() + OTP_LIFETIME_MS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otpChallengeId: id,
        otpCodeHash: this.hashOtp(id, code),
        otpExpiresAt: expiresAt,
        otpResendAfter: new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS),
        otpAttempts: 0,
        otpPurpose: purpose
      }
    });
    try {
      await this.emailSender.sendCustomerOtp(user.email, code, purpose);
    } catch (error) {
      await this.clearOtpChallenge(user.id, id);
      console.error("Customer OTP email delivery failed:", {
        purpose,
        name: error?.name || "Error",
        code: error?.code || null,
        command: error?.command || null,
        responseCode: error?.responseCode || null,
        syscall: error?.syscall
      });
      throw new ServiceUnavailableException(
        "The verification email could not be sent. Check SMTP configuration and try again later.",
        { cause: error }
      );
    }
    return { id };
  }

  async createSession(user) {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.session.create({
      data: {
        id: this.hashSessionToken(token),
        userId: user.id,
        expiresAt: new Date(this.now().getTime() + SESSION_LIFETIME_MS)
      }
    });
    return {
      token,
      user: {
        ...publicUser(user),
        ...(user.role === "CUSTOMER"
          ? { customerPermissions: await getCustomerPermissions(this.prisma) }
          : {})
      }
    };
  }

  clearedOtpChallenge() {
    return {
      otpChallengeId: null,
      otpCodeHash: null,
      otpExpiresAt: null,
      otpResendAfter: null,
      otpAttempts: 0,
      otpPurpose: null
    };
  }

  async clearOtpChallenge(userId, challengeId) {
    await this.prisma.user.updateMany({
      where: { id: userId, otpChallengeId: challengeId },
      data: this.clearedOtpChallenge()
    });
  }

  hashOtp(challengeId, code) {
    return createHmac("sha256", this.otpSecret)
      .update(`${challengeId}:${code}`)
      .digest("hex");
  }

  hashSessionToken(token) {
    return createHash("sha256").update(token).digest("hex");
  }
}

Inject(PrismaService)(AuthService, undefined, 0);
Inject(AUTH_SERVICE_OPTIONS)(AuthService, undefined, 1);
Injectable()(AuthService);

module.exports = {
  AUTH_SERVICE_OPTIONS,
  AuthService,
  comparePassword,
  publicUser
};
