const { Catch, HttpException } = require("@nestjs/common");

function diagnosticMessage(exception) {
  return String(exception.message || "")
    .replace(/\b[a-f0-9]{64}\b/gi, "[REDACTED]")
    .replace(/(["'])[A-Za-z0-9_-]{32,}\1/g, "[REDACTED]")
    .replace(/((?:password(?:hash)?|token|secret|otp|authorization|cookie|session|api[_-]?key|database_url)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi, "$1[REDACTED]")
    .replace(/mysql:\/\/[^@\s]+@/gi, "mysql://[REDACTED]@")
    .slice(0, 2000);
}

class AllExceptionsFilter {
  catch(exception, host) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    let statusCode = 500;
    let message = "Internal server error";

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      const errorMessage = typeof body === "string" ? body : body.message;
      message = Array.isArray(errorMessage) ? errorMessage.join("; ") : errorMessage;
      if (statusCode === 404 && /^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) /.test(message)) {
        message = "Route not found";
      }
    } else {
      console.error("Unhandled NestJS API error:", {
        name: exception.name || "Error",
        code: typeof exception.code === "string" ? exception.code : undefined,
        message: diagnosticMessage(exception),
        stack: diagnosticMessage({ message: exception.stack || "" }).slice(0, 8000)
      });
    }

    response.status(statusCode).json({ error: { message } });
  }
}

Catch()(AllExceptionsFilter);

module.exports = { AllExceptionsFilter };
