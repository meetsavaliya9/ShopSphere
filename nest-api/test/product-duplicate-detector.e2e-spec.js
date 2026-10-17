const {
  detectDuplicates,
  detectFileDuplicates,
  detectDatabaseDuplicates,
  generateDuplicateSummary,
  generateComparisonKey,
  normalizeForComparison,
  PRODUCT_FIELDS
} = require("../src/products/product-duplicate-detector");

describe("Product duplicate detector", () => {
  describe("normalizeForComparison", () => {
    test("trims whitespace", () => {
      expect(normalizeForComparison("  Test Product  ")).toBe("test product");
    });

    test("converts to lowercase", () => {
      expect(normalizeForComparison("Test Product")).toBe("test product");
    });

    test("handles empty string", () => {
      expect(normalizeForComparison("")).toBe("");
    });

    test("handles non-string input", () => {
      expect(normalizeForComparison(null)).toBe("");
      expect(normalizeForComparison(123)).toBe("");
    });
  });

  describe("generateComparisonKey", () => {
    test("generates consistent key for same name and category", () => {
      const key1 = generateComparisonKey("Test Product", "Electronics");
      const key2 = generateComparisonKey("test product", "electronics");
      expect(key1).toBe(key2);
    });

    test("generates different keys for different categories", () => {
      const key1 = generateComparisonKey("Test Product", "Electronics");
      const key2 = generateComparisonKey("Test Product", "Clothing");
      expect(key1).not.toBe(key2);
    });

    test("generates different keys for different names", () => {
      const key1 = generateComparisonKey("Product A", "Electronics");
      const key2 = generateComparisonKey("Product B", "Electronics");
      expect(key1).not.toBe(key2);
    });

    test("handles empty category", () => {
      const key = generateComparisonKey("Test Product", "");
      expect(key).toBe("test product|");
    });
  });

  describe("detectFileDuplicates", () => {
    test("detects duplicate rows within file", () => {
      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 4,
          status: "valid",
          data: { name: "Product B", category: "Clothing", price: 20.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = detectFileDuplicates(validationResults);

      expect(result[0].status).toBe("valid");
      expect(result[1].status).toBe("duplicate");
      expect(result[1].duplicateSource).toBe("uploaded_file");
      expect(result[1].duplicateReason).toContain("Duplicate of row 2");
      expect(result[2].status).toBe("valid");
    });

    test("detects duplicates with different capitalization", () => {
      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "product a", category: "electronics", price: 10.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = detectFileDuplicates(validationResults);

      expect(result[0].status).toBe("valid");
      expect(result[1].status).toBe("duplicate");
    });

    test("detects duplicates with different whitespace", () => {
      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "  Product A  ", category: "  Electronics  ", price: 10.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = detectFileDuplicates(validationResults);

      expect(result[0].status).toBe("valid");
      expect(result[1].status).toBe("duplicate");
    });

    test("does not treat same name with different category as duplicate", () => {
      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "Product A", category: "Clothing", price: 20.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = detectFileDuplicates(validationResults);

      expect(result[0].status).toBe("valid");
      expect(result[1].status).toBe("valid");
    });

    test("preserves invalid rows unchanged", () => {
      const validationResults = [
        {
          rowNumber: 2,
          status: "invalid",
          data: null,
          errors: ["Missing required field"],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = detectFileDuplicates(validationResults);

      expect(result[0].status).toBe("invalid");
      expect(result[1].status).toBe("valid");
    });

    test("handles no duplicates", () => {
      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "Product B", category: "Clothing", price: 20.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = detectFileDuplicates(validationResults);

      expect(result[0].status).toBe("valid");
      expect(result[1].status).toBe("valid");
    });

    test("preserves original row numbers", () => {
      const validationResults = [
        {
          rowNumber: 5,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 10,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = detectFileDuplicates(validationResults);

      expect(result[0].rowNumber).toBe(5);
      expect(result[1].rowNumber).toBe(10);
      expect(result[1].duplicateReason).toContain("Duplicate of row 5");
    });
  });

  describe("detectDatabaseDuplicates", () => {
    test("detects duplicates against existing database", async () => {
      const prisma = {
        product: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, name: "Product A", category: "Electronics", managerId: null },
            { id: 2, name: "Product B", category: "Clothing", managerId: null }
          ])
        }
      };

      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "Product C", category: "Books", price: 30.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = await detectDatabaseDuplicates(validationResults, prisma);

      expect(result[0].status).toBe("duplicate");
      expect(result[0].duplicateSource).toBe("existing_database");
      expect(result[0].duplicateReason).toContain("Product already exists in database (ID: 1)");
      expect(result[0].existingProductId).toBe(1);
      expect(result[1].status).toBe("valid");
    });

    test("queries only relevant products by name and category", async () => {
      const prisma = {
        product: {
          findMany: jest.fn().mockResolvedValue([])
        }
      };

      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        }
      ];

      await detectDatabaseDuplicates(validationResults, prisma);

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: "Product A" },
            { category: "Electronics" }
          ]
        },
        select: {
          id: true,
          name: true,
          category: true,
          managerId: true
        }
      });
    });

    test("filters by managerId when provided", async () => {
      const prisma = {
        product: {
          findMany: jest.fn().mockResolvedValue([])
        }
      };

      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        }
      ];

      await detectDatabaseDuplicates(validationResults, prisma, 5);

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: "Product A" },
            { category: "Electronics" }
          ],
          managerId: 5
        },
        select: {
          id: true,
          name: true,
          category: true,
          managerId: true
        }
      });
    });

    test("preserves invalid rows unchanged", async () => {
      const prisma = {
        product: {
          findMany: jest.fn().mockResolvedValue([])
        }
      };

      const validationResults = [
        {
          rowNumber: 2,
          status: "invalid",
          data: null,
          errors: ["Missing required field"],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = await detectDatabaseDuplicates(validationResults, prisma);

      expect(result[0].status).toBe("invalid");
      expect(result[1].status).toBe("valid");
    });

    test("returns original results when no valid rows", async () => {
      const prisma = {
        product: {
          findMany: jest.fn().mockResolvedValue([])
        }
      };

      const validationResults = [
        {
          rowNumber: 2,
          status: "invalid",
          data: null,
          errors: ["Missing required field"],
          warnings: []
        }
      ];

      const result = await detectDatabaseDuplicates(validationResults, prisma);

      expect(result).toEqual(validationResults);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe("detectDuplicates", () => {
    test("combines file and database duplicate detection", async () => {
      const prisma = {
        product: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, name: "Product A", category: "Electronics", managerId: null }
          ])
        }
      };

      const validationResults = [
        {
          rowNumber: 2,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        },
        {
          rowNumber: 4,
          status: "valid",
          data: { name: "Product B", category: "Clothing", price: 20.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = await detectDuplicates(validationResults, prisma);

      expect(result[0].status).toBe("duplicate");
      expect(result[0].duplicateSource).toBe("existing_database");
      expect(result[1].status).toBe("duplicate");
      expect(result[1].duplicateSource).toBe("uploaded_file");
      expect(result[2].status).toBe("valid");
    });

    test("preserves existing validation errors", async () => {
      const prisma = {
        product: {
          findMany: jest.fn().mockResolvedValue([])
        }
      };

      const validationResults = [
        {
          rowNumber: 2,
          status: "invalid",
          data: null,
          errors: ["Missing required field"],
          warnings: []
        },
        {
          rowNumber: 3,
          status: "valid",
          data: { name: "Product A", category: "Electronics", price: 10.00 },
          errors: [],
          warnings: []
        }
      ];

      const result = await detectDuplicates(validationResults, prisma);

      expect(result[0].status).toBe("invalid");
      expect(result[0].errors).toEqual(["Missing required field"]);
      expect(result[1].status).toBe("valid");
    });
  });

  describe("generateDuplicateSummary", () => {
    test("counts valid, duplicate, and invalid rows", () => {
      const results = [
        { status: "valid" },
        { status: "valid" },
        { status: "duplicate", duplicateSource: "uploaded_file" },
        { status: "duplicate", duplicateSource: "existing_database" },
        { status: "invalid" }
      ];

      const summary = generateDuplicateSummary(results);

      expect(summary.total).toBe(5);
      expect(summary.valid).toBe(2);
      expect(summary.duplicate).toBe(2);
      expect(summary.invalid).toBe(1);
      expect(summary.duplicateBreakdown.withinFile).toBe(1);
      expect(summary.duplicateBreakdown.existingDatabase).toBe(1);
    });

    test("handles all valid rows", () => {
      const results = [
        { status: "valid" },
        { status: "valid" },
        { status: "valid" }
      ];

      const summary = generateDuplicateSummary(results);

      expect(summary.valid).toBe(3);
      expect(summary.duplicate).toBe(0);
      expect(summary.invalid).toBe(0);
    });

    test("handles all duplicate rows", () => {
      const results = [
        { status: "duplicate", duplicateSource: "uploaded_file" },
        { status: "duplicate", duplicateSource: "existing_database" }
      ];

      const summary = generateDuplicateSummary(results);

      expect(summary.valid).toBe(0);
      expect(summary.duplicate).toBe(2);
      expect(summary.duplicateBreakdown.withinFile).toBe(1);
      expect(summary.duplicateBreakdown.existingDatabase).toBe(1);
    });

    test("handles all invalid rows", () => {
      const results = [
        { status: "invalid" },
        { status: "invalid" }
      ];

      const summary = generateDuplicateSummary(results);

      expect(summary.valid).toBe(0);
      expect(summary.duplicate).toBe(0);
      expect(summary.invalid).toBe(2);
    });

    test("handles mixed valid, invalid, and duplicate rows", () => {
      const results = [
        { status: "valid" },
        { status: "invalid" },
        { status: "duplicate", duplicateSource: "uploaded_file" },
        { status: "valid" },
        { status: "invalid" },
        { status: "duplicate", duplicateSource: "existing_database" }
      ];

      const summary = generateDuplicateSummary(results);

      expect(summary.total).toBe(6);
      expect(summary.valid).toBe(2);
      expect(summary.invalid).toBe(2);
      expect(summary.duplicate).toBe(2);
    });
  });

  describe("PRODUCT_FIELDS", () => {
    test("contains expected field names", () => {
      expect(PRODUCT_FIELDS.NAME).toBe("name");
      expect(PRODUCT_FIELDS.CATEGORY).toBe("category");
      expect(PRODUCT_FIELDS.PRICE).toBe("price");
    });
  });
});
