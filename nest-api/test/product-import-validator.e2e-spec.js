const {
  validateImportRows,
  mapHeaders,
  validateHeaders,
  validateRow,
  HEADER_MAPPINGS,
  VALIDATION_RULES,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  ALLOWED_IMAGE_HOSTS,
  isValidImageUrl
} = require("../src/products/product-import-validator");

describe("Product import validator", () => {
  describe("HEADER_MAPPINGS", () => {
    test("contains name mappings", () => {
      expect(HEADER_MAPPINGS.name).toContain("name");
      expect(HEADER_MAPPINGS.name).toContain("product_name");
      expect(HEADER_MAPPINGS.name).toContain("product name");
    });

    test("contains category mappings", () => {
      expect(HEADER_MAPPINGS.category).toContain("category");
      expect(HEADER_MAPPINGS.category).toContain("category_name");
      expect(HEADER_MAPPINGS.category).toContain("category name");
    });

    test("contains price mappings", () => {
      expect(HEADER_MAPPINGS.price).toContain("price");
      expect(HEADER_MAPPINGS.price).toContain("product_price");
      expect(HEADER_MAPPINGS.price).toContain("product price");
    });

    test("contains description mappings", () => {
      expect(HEADER_MAPPINGS.description).toContain("description");
      expect(HEADER_MAPPINGS.description).toContain("desc");
      expect(HEADER_MAPPINGS.description).toContain("product description");
    });

    test("contains image field mappings", () => {
      expect(HEADER_MAPPINGS.imageUrl).toContain("image_url");
      expect(HEADER_MAPPINGS.imageUrl).toContain("image url");
      expect(HEADER_MAPPINGS.imagePublicId).toContain("image_public_id");
      expect(HEADER_MAPPINGS.imagePublicId).toContain("image public id");
    });
  });

  describe("VALIDATION_RULES", () => {
    test("has name rules", () => {
      expect(VALIDATION_RULES.name.required).toBe(true);
      expect(VALIDATION_RULES.name.maxLength).toBe(191);
      expect(VALIDATION_RULES.name.type).toBe("string");
    });

    test("has category rules", () => {
      expect(VALIDATION_RULES.category.required).toBe(true);
      expect(VALIDATION_RULES.category.maxLength).toBe(100);
      expect(VALIDATION_RULES.category.type).toBe("string");
    });

    test("has price rules", () => {
      expect(VALIDATION_RULES.price.required).toBe(true);
      expect(VALIDATION_RULES.price.min).toBe(0);
      expect(VALIDATION_RULES.price.max).toBe(99999999.99);
      expect(VALIDATION_RULES.price.type).toBe("number");
    });

    test("has optional field rules", () => {
      expect(VALIDATION_RULES.description.required).toBe(false);
      expect(VALIDATION_RULES.imageUrl.required).toBe(false);
      expect(VALIDATION_RULES.imagePublicId.required).toBe(false);
    });
  });

  describe("REQUIRED_FIELDS and OPTIONAL_FIELDS", () => {
    test("contains required fields", () => {
      expect(REQUIRED_FIELDS.has("name")).toBe(true);
      expect(REQUIRED_FIELDS.has("category")).toBe(true);
      expect(REQUIRED_FIELDS.has("price")).toBe(true);
    });

    test("contains optional fields", () => {
      expect(OPTIONAL_FIELDS.has("description")).toBe(true);
      expect(OPTIONAL_FIELDS.has("imageUrl")).toBe(true);
      expect(OPTIONAL_FIELDS.has("imagePublicId")).toBe(true);
    });
  });

  describe("mapHeaders", () => {
    test("maps standard headers correctly", () => {
      const headers = ["name", "category", "price", "description"];
      const result = mapHeaders(headers);

      expect(result.mappedFields.has("name")).toBe(true);
      expect(result.mappedFields.has("category")).toBe(true);
      expect(result.mappedFields.has("price")).toBe(true);
      expect(result.mappedFields.has("description")).toBe(true);
      expect(result.unexpectedHeaders).toHaveLength(0);
      expect(result.duplicateMappings).toHaveLength(0);
    });

    test("maps alternative headers", () => {
      const headers = ["product_name", "category_name", "product_price"];
      const result = mapHeaders(headers);

      expect(result.mappedFields.has("name")).toBe(true);
      expect(result.mappedFields.has("category")).toBe(true);
      expect(result.mappedFields.has("price")).toBe(true);
    });

    test("detects unexpected headers", () => {
      const headers = ["name", "category", "unexpected_field"];
      const result = mapHeaders(headers);

      expect(result.unexpectedHeaders).toContain("unexpected_field");
    });

    test("detects duplicate mappings", () => {
      const headers = ["name", "product_name", "category"];
      const result = mapHeaders(headers);

      expect(result.duplicateMappings).toHaveLength(1);
      expect(result.duplicateMappings[0].field).toBe("name");
    });
  });

  describe("validateHeaders", () => {
    test("validates all required fields present", () => {
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateHeaders(mappedFields);

      expect(result.hasErrors).toBe(false);
      expect(result.missingRequired).toHaveLength(0);
    });

    test("detects missing required fields", () => {
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"]
      ]);

      const result = validateHeaders(mappedFields);

      expect(result.hasErrors).toBe(true);
      expect(result.missingRequired).toContain("price");
    });

    test("detects all required fields missing", () => {
      const mappedFields = new Map();

      const result = validateHeaders(mappedFields);

      expect(result.hasErrors).toBe(true);
      expect(result.missingRequired).toHaveLength(3);
    });
  });

  describe("validateRow", () => {
    test("validates a complete valid row", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 10.00,
        description: "A test product"
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["description", "description"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("valid");
      expect(result.errors).toHaveLength(0);
      expect(result.data.name).toBe("Test Product");
      expect(result.data.category).toBe("Electronics");
      expect(result.data.price).toBe(10.00);
      expect(result.data.description).toBe("A test product");
    });

    test("skips empty rows", () => {
      const row = {};
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("skipped");
      expect(result.errors).toContain("Row is empty");
    });

    test("detects missing required field", () => {
      const row = {
        name: "Test Product",
        category: "Electronics"
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("price is required");
    });

    test("detects negative price", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: -10.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("price cannot be negative");
    });

    test("detects price exceeding maximum", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 100000000.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("price exceeds maximum allowed value of 99999999.99");
    });

    test("detects invalid price format", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: "not a number"
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("price must be a valid number");
    });

    test("detects name exceeding max length", () => {
      const row = {
        name: "A".repeat(200),
        category: "Electronics",
        price: 10.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("name exceeds maximum length of 191 characters");
    });

    test("detects category exceeding max length", () => {
      const row = {
        name: "Test Product",
        category: "A".repeat(110),
        price: 10.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("category exceeds maximum length of 100 characters");
    });

    test("detects empty name", () => {
      const row = {
        name: "   ",
        category: "Electronics",
        price: 10.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("name cannot be empty");
    });

    test("detects empty category", () => {
      const row = {
        name: "Test Product",
        category: "",
        price: 10.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("category cannot be empty");
    });

    test("handles optional description field", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 10.00,
        description: "A test product"
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["description", "description"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("valid");
      expect(result.data.description).toBe("A test product");
    });

    test("handles missing optional description field when not in row", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 10.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["description", "description"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("valid");
      expect(result.data.description).toBe("");
    });

    test("handles optional field not in mappedFields", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 10.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("valid");
      expect(result.data.description).toBeUndefined();
    });

    test("validates imageUrl max length", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 10.00,
        imageUrl: "A".repeat(2050)
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["imageUrl", "imageUrl"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("imageUrl exceeds maximum length of 2048 characters");
    });

    test("accepts valid imageUrl from configured hosts (images.unsplash.com and res.cloudinary.com)", () => {
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["imageUrl", "imageUrl"]
      ]);

      const unsplashRow = {
        name: "Unsplash Product",
        category: "Electronics",
        price: 99.99,
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e"
      };
      const unsplashResult = validateRow(unsplashRow, 2, mappedFields);
      expect(unsplashResult.status).toBe("valid");
      expect(unsplashResult.data.imageUrl).toBe("https://images.unsplash.com/photo-1505740420928-5e560c06d30e");

      const cloudinaryRow = {
        name: "Cloudinary Product",
        category: "Electronics",
        price: 99.99,
        imageUrl: "https://res.cloudinary.com/shopsphere/image/upload/v1234/sample.jpg"
      };
      const cloudinaryResult = validateRow(cloudinaryRow, 3, mappedFields);
      expect(cloudinaryResult.status).toBe("valid");
      expect(cloudinaryResult.data.imageUrl).toBe("https://res.cloudinary.com/shopsphere/image/upload/v1234/sample.jpg");
    });

    test("handles optional missing or empty imageUrl safely", () => {
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["imageUrl", "imageUrl"]
      ]);

      const emptyRow = {
        name: "Product Without Image",
        category: "Home",
        price: 49.99,
        imageUrl: ""
      };
      const result = validateRow(emptyRow, 2, mappedFields);
      expect(result.status).toBe("valid");
      expect(result.data.imageUrl).toBeNull();
      expect(result.errors).toHaveLength(0);

      const nullRow = {
        name: "Product With Null Image",
        category: "Home",
        price: 49.99,
        imageUrl: null
      };
      const nullResult = validateRow(nullRow, 3, mappedFields);
      expect(nullResult.status).toBe("valid");
      expect(nullResult.data.imageUrl).toBeNull();
    });

    test("rejects unconfigured imageUrl hostname (such as example.com)", () => {
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["imageUrl", "imageUrl"]
      ]);

      const row = {
        name: "Notebook Pack",
        category: "Office",
        price: 19.99,
        imageUrl: "https://example.com/images/notebook-pack.jpg"
      };
      const result = validateRow(row, 2, mappedFields);
      expect(result.status).toBe("invalid");
      expect(result.errors.some((err) => err.includes("hostname \"example.com\" is not configured"))).toBe(true);
    });

    test("rejects malformed or non-http imageUrl", () => {
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["imageUrl", "imageUrl"]
      ]);

      const malformedResult = validateRow({
        name: "Test",
        category: "Office",
        price: 10,
        imageUrl: "not-a-valid-url"
      }, 2, mappedFields);
      expect(malformedResult.status).toBe("invalid");
      expect(malformedResult.errors).toContain("imageUrl must be a valid URL");

      const ftpResult = validateRow({
        name: "Test",
        category: "Office",
        price: 10,
        imageUrl: "ftp://images.unsplash.com/file.jpg"
      }, 3, mappedFields);
      expect(ftpResult.status).toBe("invalid");
      expect(ftpResult.errors).toContain("imageUrl must use http or https protocol");
    });

    test("validates imagePublicId max length", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 10.00,
        imagePublicId: "A".repeat(260)
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"],
        ["imagePublicId", "imagePublicId"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("imagePublicId exceeds maximum length of 255 characters");
    });

    test("warns about unexpected fields", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 10.00,
        unexpected_field: "value"
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 2, mappedFields);

      expect(result.status).toBe("valid");
      expect(result.warnings).toContain('Unexpected field "unexpected_field" will be ignored');
    });

    test("preserves row number", () => {
      const row = {
        name: "Test Product",
        category: "Electronics",
        price: 10.00
      };
      const mappedFields = new Map([
        ["name", "name"],
        ["category", "category"],
        ["price", "price"]
      ]);

      const result = validateRow(row, 5, mappedFields);

      expect(result.rowNumber).toBe(5);
    });
  });

  describe("validateImportRows", () => {
    test("validates complete valid import", () => {
      const parsedData = {
        headers: ["name", "category", "price", "description"],
        rows: [
          { name: "Product 1", category: "Electronics", price: 10.00, description: "Test" },
          { name: "Product 2", category: "Clothing", price: 20.00, description: "Test" }
        ],
        filename: "products.csv"
      };

      const result = validateImportRows(parsedData);

      expect(result.headerValidation.valid).toBe(true);
      expect(result.headerValidation.missingRequired).toHaveLength(0);
      expect(result.rowResults).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.valid).toBe(2);
      expect(result.summary.invalid).toBe(0);
      expect(result.summary.skipped).toBe(0);
    });

    test("detects missing required headers", () => {
      const parsedData = {
        headers: ["name", "category"],
        rows: [{ name: "Product 1", category: "Electronics" }],
        filename: "products.csv"
      };

      const result = validateImportRows(parsedData);

      expect(result.headerValidation.valid).toBe(false);
      expect(result.headerValidation.missingRequired).toContain("price");
      expect(result.rowResults).toHaveLength(0);
    });

    test("detects duplicate header mappings", () => {
      const parsedData = {
        headers: ["name", "product_name", "category", "price"],
        rows: [{ name: "Product 1", category: "Electronics", price: 10.00 }],
        filename: "products.csv"
      };

      const result = validateImportRows(parsedData);

      expect(result.headerValidation.duplicateMappings).toHaveLength(1);
      expect(result.headerValidation.duplicateMappings[0].field).toBe("name");
    });

    test("reports unexpected headers", () => {
      const parsedData = {
        headers: ["name", "category", "price", "unexpected_field"],
        rows: [{ name: "Product 1", category: "Electronics", price: 10.00, unexpected_field: "value" }],
        filename: "products.csv"
      };

      const result = validateImportRows(parsedData);

      expect(result.headerValidation.unexpectedHeaders).toContain("unexpected_field");
    });

    test("validates rows with errors", () => {
      const parsedData = {
        headers: ["name", "category", "price"],
        rows: [
          { name: "Product 1", category: "Electronics", price: 10.00 },
          { name: "Product 2", category: "Clothing", price: -5.00 }
        ],
        filename: "products.csv"
      };

      const result = validateImportRows(parsedData);

      expect(result.summary.total).toBe(2);
      expect(result.summary.valid).toBe(1);
      expect(result.summary.invalid).toBe(1);
      expect(result.rowResults[1].status).toBe("invalid");
    });

    test("skips empty rows", () => {
      const parsedData = {
        headers: ["name", "category", "price"],
        rows: [
          { name: "Product 1", category: "Electronics", price: 10.00 },
          {},
          { name: "Product 2", category: "Clothing", price: 20.00 }
        ],
        filename: "products.csv"
      };

      const result = validateImportRows(parsedData);

      expect(result.summary.total).toBe(3);
      expect(result.summary.valid).toBe(2);
      expect(result.summary.skipped).toBe(1);
      expect(result.rowResults[1].status).toBe("skipped");
    });

    test("preserves filename", () => {
      const parsedData = {
        headers: ["name", "category", "price"],
        rows: [{ name: "Product 1", category: "Electronics", price: 10.00 }],
        filename: "test-products.xlsx"
      };

      const result = validateImportRows(parsedData);

      expect(result.filename).toBe("test-products.xlsx");
    });
  });
});
