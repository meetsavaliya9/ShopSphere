const { BadRequestException } = require("@nestjs/common");

const HEADER_MAPPINGS = Object.freeze({
  // Primary mappings
  name: ["name", "product_name", "productname", "product name"],
  category: ["category", "category_name", "categoryname", "category name"],
  price: ["price", "product_price", "productprice", "product price", "amount"],
  description: ["description", "desc", "product_description", "productdescription", "product description"],
  imageUrl: ["image_url", "imageurl", "image url", "image"],
  imagePublicId: ["image_public_id", "imagepublicid", "image public id"],
  stockQuantity: ["stock_quantity", "stockquantity", "stock quantity", "stock", "quantity", "inventory"],
  lowStockThreshold: ["low_stock_threshold", "lowstockthreshold", "low stock threshold", "threshold", "alert_threshold"]
});

const REVERSE_HEADER_MAPPINGS = Object.freeze(
  Object.entries(HEADER_MAPPINGS).reduce((acc, [field, headers]) => {
    headers.forEach((header) => {
      acc[header.toLowerCase()] = field;
    });
    return acc;
  }, {})
);

const REQUIRED_FIELDS = new Set(["name", "category", "price"]);
const OPTIONAL_FIELDS = new Set(["description", "imageUrl", "imagePublicId", "stockQuantity", "lowStockThreshold"]);
const ALL_ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);

const VALIDATION_RULES = Object.freeze({
  name: {
    required: true,
    maxLength: 191,
    type: "string"
  },
  category: {
    required: true,
    maxLength: 100,
    type: "string"
  },
  price: {
    required: true,
    min: 0,
    max: 99999999.99,
    type: "number"
  },
  description: {
    required: false,
    maxLength: null, // Text field, no practical limit
    type: "string"
  },
  imageUrl: {
    required: false,
    maxLength: 2048,
    type: "string"
  },
  imagePublicId: {
    required: false,
    maxLength: 255,
    type: "string"
  },
  stockQuantity: {
    required: false,
    min: 0,
    max: 2147483647,
    type: "number"
  },
  lowStockThreshold: {
    required: false,
    min: 0,
    max: 2147483647,
    type: "number"
  }
});

function mapHeaders(headers) {
  const mappedFields = new Map();
  const usedHeaders = new Set();
  const unexpectedHeaders = [];
  const duplicateMappings = [];

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase();
    const targetField = REVERSE_HEADER_MAPPINGS[normalizedHeader];

    if (targetField) {
      if (mappedFields.has(targetField)) {
        duplicateMappings.push({
          field: targetField,
          firstHeader: mappedFields.get(targetField),
          duplicateHeader: header
        });
      } else {
        mappedFields.set(targetField, header);
      }
      usedHeaders.add(normalizedHeader);
    } else {
      unexpectedHeaders.push(header);
    }
  }

  return {
    mappedFields,
    usedHeaders,
    unexpectedHeaders,
    duplicateMappings
  };
}

function validateHeaders(mappedFields) {
  const missingRequired = [];
  const missingFields = [];

  for (const field of REQUIRED_FIELDS) {
    if (!mappedFields.has(field)) {
      missingRequired.push(field);
      missingFields.push(field);
    }
  }

  return {
    missingRequired,
    missingFields,
    hasErrors: missingRequired.length > 0
  };
}

function validateRow(row, rowNumber, mappedFields) {
  const errors = [];
  const warnings = [];
  const validatedData = {};
  let isEmpty = true;

  // Check if row is empty
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined && value !== "") {
      isEmpty = false;
      break;
    }
  }

  if (isEmpty) {
    return {
      rowNumber,
      status: "skipped",
      data: null,
      errors: ["Row is empty"],
      warnings: []
    };
  }

  // Validate each mapped field
  for (const [field, header] of mappedFields.entries()) {
    const rawValue = row[header];
    const rules = VALIDATION_RULES[field];

    if (rawValue === null || rawValue === undefined || rawValue === "") {
      if (rules.required) {
        errors.push(`${field} is required`);
      } else {
        // Optional field - set default value if applicable
        if (field === "description") {
          validatedData[field] = "";
        } else if (field === "imageUrl" || field === "imagePublicId" || field === "stockQuantity" || field === "lowStockThreshold") {
          validatedData[field] = null;
        }
        continue;
      }
    }

    // Type and value validation
    if (field === "name") {
      if (typeof rawValue !== "string") {
        errors.push(`${field} must be text`);
      } else if (!rawValue.trim()) {
        errors.push(`${field} cannot be empty`);
      } else if (rawValue.trim().length > rules.maxLength) {
        errors.push(`${field} exceeds maximum length of ${rules.maxLength} characters`);
      } else {
        validatedData[field] = rawValue.trim();
      }
    }

    if (field === "category") {
      if (typeof rawValue !== "string") {
        errors.push(`${field} must be text`);
      } else if (!rawValue.trim()) {
        errors.push(`${field} cannot be empty`);
      } else if (rawValue.trim().length > rules.maxLength) {
        errors.push(`${field} exceeds maximum length of ${rules.maxLength} characters`);
      } else {
        validatedData[field] = rawValue.trim();
      }
    }

    if (field === "price") {
      const price = Number(rawValue);
      if (!Number.isFinite(price)) {
        errors.push(`${field} must be a valid number`);
      } else if (price < rules.min) {
        errors.push(`${field} cannot be negative`);
      } else if (price > rules.max) {
        errors.push(`${field} exceeds maximum allowed value of ${rules.max}`);
      } else {
        validatedData[field] = price;
      }
    }

    if (field === "description") {
      if (rawValue !== null && typeof rawValue !== "string") {
        errors.push(`${field} must be text`);
      } else {
        validatedData[field] = rawValue ? rawValue.trim() : "";
      }
    }

    if (field === "imageUrl") {
      if (rawValue !== null && typeof rawValue !== "string") {
        errors.push(`${field} must be text`);
      } else if (rawValue && rawValue.length > rules.maxLength) {
        errors.push(`${field} exceeds maximum length of ${rules.maxLength} characters`);
      } else {
        validatedData[field] = rawValue || null;
      }
    }

    if (field === "imagePublicId") {
      if (rawValue !== null && typeof rawValue !== "string") {
        errors.push(`${field} must be text`);
      } else if (rawValue && rawValue.length > rules.maxLength) {
        errors.push(`${field} exceeds maximum length of ${rules.maxLength} characters`);
      } else {
        validatedData[field] = rawValue || null;
      }
    }

    if (field === "stockQuantity") {
      const quantity = Number(rawValue);
      if (rawValue !== null && rawValue !== undefined && rawValue !== "") {
        if (!Number.isFinite(quantity)) {
          errors.push(`${field} must be a valid number`);
        } else if (quantity < rules.min || quantity > rules.max) {
          errors.push(`${field} must be between ${rules.min} and ${rules.max}`);
        } else if (!Number.isSafeInteger(quantity)) {
          errors.push(`${field} must be a whole number`);
        } else {
          validatedData[field] = quantity;
        }
      } else {
        validatedData[field] = null;
      }
    }

    if (field === "lowStockThreshold") {
      const threshold = Number(rawValue);
      if (rawValue !== null && rawValue !== undefined && rawValue !== "") {
        if (!Number.isFinite(threshold)) {
          errors.push(`${field} must be a valid number`);
        } else if (threshold < rules.min || threshold > rules.max) {
          errors.push(`${field} must be between ${rules.min} and ${rules.max}`);
        } else if (!Number.isSafeInteger(threshold)) {
          errors.push(`${field} must be a whole number`);
        } else {
          validatedData[field] = threshold;
        }
      } else {
        validatedData[field] = null;
      }
    }
  }

  // Check for unexpected fields in row
  for (const key of Object.keys(row)) {
    const normalizedKey = key.toLowerCase();
    const isMapped = Array.from(mappedFields.values()).some(
      (h) => h.toLowerCase() === normalizedKey
    );
    if (!isMapped && key !== "" && row[key] !== null && row[key] !== undefined && row[key] !== "") {
      warnings.push(`Unexpected field "${key}" will be ignored`);
    }
  }

  const status = errors.length === 0 ? "valid" : "invalid";

  return {
    rowNumber,
    status,
    data: status === "valid" ? validatedData : null,
    errors,
    warnings
  };
}

function validateImportRows(parsedData) {
  const { headers, rows, filename } = parsedData;

  // Map headers
  const { mappedFields, unexpectedHeaders, duplicateMappings } = mapHeaders(headers);

  // Validate headers
  const headerValidation = validateHeaders(mappedFields);

  // If headers have errors, return early
  if (headerValidation.hasErrors) {
    return {
      filename,
      headerValidation: {
        valid: false,
        missingRequired: headerValidation.missingRequired,
        unexpectedHeaders,
        duplicateMappings
      },
      rowResults: [],
      summary: {
        total: rows.length,
        valid: 0,
        invalid: 0,
        skipped: 0
      }
    };
  }

  // Validate each row
  const rowResults = rows.map((row, index) => {
    const rowNumber = index + 2; // +2 because: index 0 is row 2 (header is row 1)
    return validateRow(row, rowNumber, mappedFields);
  });

  // Calculate summary
  const summary = {
    total: rowResults.length,
    valid: rowResults.filter((r) => r.status === "valid").length,
    invalid: rowResults.filter((r) => r.status === "invalid").length,
    skipped: rowResults.filter((r) => r.status === "skipped").length
  };

  return {
    filename,
    headerValidation: {
      valid: true,
      missingRequired: [],
      unexpectedHeaders,
      duplicateMappings
    },
    rowResults,
    summary
  };
}

module.exports = {
  validateImportRows,
  mapHeaders,
  validateHeaders,
  validateRow,
  HEADER_MAPPINGS,
  VALIDATION_RULES,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS
};
