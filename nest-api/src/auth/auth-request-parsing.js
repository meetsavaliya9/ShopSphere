const express = require("express");

const PARSING_INSTALLED = Symbol("PARSING_INSTALLED");

function parseCookies(request, response, next) {
  const cookieHeader = request.headers.cookie;
  request.cookies = Object.create(null);
  if (typeof cookieHeader === "string") {
    for (const part of cookieHeader.split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (!name) continue;
      try {
        request.cookies[name] = decodeURIComponent(value);
      } catch {
        request.cookies[name] = value;
      }
    }
  }
  next();
}

function jsonParseError(error, request, response, next) {
  if (error?.type === "entity.parse.failed") {
    response.status(400).json({ error: { message: "Invalid JSON request body" } });
    return;
  }
  next(error);
}

function installJsonCookieParsing(app, path = "/api/v1") {
  app.use(path, express.json({
    limit: "10kb",
    verify(request, response, buffer) {
      const requestPath = request.originalUrl?.split("?", 1)[0] || "";
      if (requestPath.endsWith("/payments/razorpay/webhook")) {
        request.rawBody = Buffer.from(buffer);
      }
    }
  }), jsonParseError, parseCookies);
}

function installApiRequestParsing(app) {
  if (app[PARSING_INSTALLED]) return;
  app[PARSING_INSTALLED] = true;
  installJsonCookieParsing(app, "/api/v1");
}

function installAuthRequestParsing(app) {
  installApiRequestParsing(app);
}

function installCategoryRequestParsing(app) {
  installApiRequestParsing(app);
}

module.exports = {
  installApiRequestParsing,
  installAuthRequestParsing,
  installCategoryRequestParsing,
  installJsonCookieParsing
};
