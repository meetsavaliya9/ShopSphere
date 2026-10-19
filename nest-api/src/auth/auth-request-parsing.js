const express = require("express");
const multer = require("multer");
const { BadRequestException } = require("@nestjs/common");

const PARSING_INSTALLED = Symbol("PARSING_INSTALLED");
const IMPORT_JSON_LIMIT = "5mb";
const DEFAULT_JSON_LIMIT = "10kb";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Configure multer for memory storage (preview & import file handling)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [".csv", ".xlsx", ".xls"];
    const allowedMimeTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ];

    const originalName = file.originalname || "";
    const extIndex = originalName.lastIndexOf(".");
    const ext = extIndex >= 0 ? originalName.toLowerCase().slice(extIndex) : "";
    const isValidExtension = allowedExtensions.includes(ext);
    const isValidMimeType = allowedMimeTypes.includes(file.mimetype);

    if (isValidExtension || isValidMimeType) {
      cb(null, true);
    } else {
      cb(new BadRequestException("Invalid file type. Only CSV and Excel files are allowed."));
    }
  }
});

function handleFileUpload(req, res, next) {
  if (req.file) {
    return next();
  }
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return next();
  }

  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE" || err.name === "MulterError") {
        return res.status(413).json({
          error: { message: "File size exceeds 5MB limit. Please upload a smaller file." }
        });
      }
      if (err instanceof BadRequestException) {
        return res.status(400).json({ error: { message: err.message } });
      }
      if (err.message && err.message.includes("Invalid file type")) {
        return res.status(400).json({ error: { message: err.message } });
      }
      return next(err);
    }
    next();
  });
}

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
  if (error?.type === "entity.too.large" || error?.status === 413 || error?.statusCode === 413) {
    response.status(413).json({ error: { message: "Request payload exceeds allowed limit" } });
    return;
  }
  next(error);
}

function installJsonCookieParsing(app, path = "/api/v1") {
  // 1. Parse cookies on all incoming requests
  app.use(path, parseCookies);

  // 2. Multer file upload handling for multipart requests on import & preview endpoints
  const importRoutes = [
    `${path}/admin/products/import`,
    `${path}/manager/products/import`,
    `${path}/admin/products/import/preview`,
    `${path}/manager/products/import/preview`,
    "/admin/products/import",
    "/manager/products/import",
    "/admin/products/import/preview",
    "/manager/products/import/preview"
  ];
  app.use(importRoutes, handleFileUpload);

  // 3. Route-specific JSON parsing with 5MB limit for batch product imports
  const importJsonRoutes = [
    `${path}/admin/products/import`,
    `${path}/manager/products/import`,
    "/admin/products/import",
    "/manager/products/import"
  ];
  app.use(
    importJsonRoutes,
    express.json({ limit: IMPORT_JSON_LIMIT }),
    jsonParseError
  );

  // 4. Default tight 10kb JSON parsing for all other API endpoints
  app.use(
    path,
    express.json({
      limit: DEFAULT_JSON_LIMIT,
      verify(request, response, buffer) {
        const requestPath = request.originalUrl?.split("?", 1)[0] || "";
        if (requestPath.endsWith("/payments/razorpay/webhook")) {
          request.rawBody = Buffer.from(buffer);
        }
      }
    }),
    jsonParseError
  );
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
  installJsonCookieParsing,
  handleFileUpload,
  upload,
  IMPORT_JSON_LIMIT,
  DEFAULT_JSON_LIMIT,
  MAX_FILE_SIZE
};
