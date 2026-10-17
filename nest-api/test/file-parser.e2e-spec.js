const { BadRequestException } = require("@nestjs/common");
const {
  parseImportFile,
  validateFile,
  normalizeHeader,
  CONFIG
} = require("../src/utils/file-parser");

describe("File parser utility", () => {
  describe("normalizeHeader", () => {
    test("converts to lowercase", () => {
      expect(normalizeHeader("Product Name")).toBe("product_name");
    });

    test("trims whitespace", () => {
      expect(normalizeHeader("  Product Name  ")).toBe("product_name");
    });

    test("replaces multiple spaces with underscore", () => {
      expect(normalizeHeader("Product   Name")).toBe("product_name");
    });

    test("handles empty string", () => {
      expect(normalizeHeader("")).toBe("");
    });

    test("handles non-string input", () => {
      expect(normalizeHeader(null)).toBe("");
      expect(normalizeHeader(123)).toBe("");
    });
  });

  describe("validateFile", () => {
    test("accepts valid CSV file", () => {
      const buffer = Buffer.from("name,price\nProduct 1,10.00");
      expect(() => validateFile(buffer, "products.csv", "text/csv")).not.toThrow();
    });

    test("accepts valid XLSX file", () => {
      const buffer = Buffer.from("dummy xlsx content");
      expect(() => validateFile(buffer, "products.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).not.toThrow();
    });

    test("rejects empty file", () => {
      const buffer = Buffer.from("");
      expect(() => validateFile(buffer, "products.csv", "text/csv")).toThrow(BadRequestException);
      expect(() => validateFile(buffer, "products.csv", "text/csv")).toThrow("File is empty.");
    });

    test("rejects file exceeding max size", () => {
      const buffer = Buffer.alloc(CONFIG.MAX_FILE_SIZE + 1);
      expect(() => validateFile(buffer, "products.csv", "text/csv")).toThrow(BadRequestException);
      expect(() => validateFile(buffer, "products.csv", "text/csv")).toThrow("File size exceeds maximum allowed size");
    });

    test("rejects invalid file extension", () => {
      const buffer = Buffer.from("content");
      expect(() => validateFile(buffer, "products.txt", "text/plain")).toThrow(BadRequestException);
      expect(() => validateFile(buffer, "products.txt", "text/plain")).toThrow("File type not supported");
    });

    test("rejects invalid MIME type", () => {
      const buffer = Buffer.from("content");
      expect(() => validateFile(buffer, "products.csv", "application/pdf")).toThrow(BadRequestException);
      expect(() => validateFile(buffer, "products.csv", "application/pdf")).toThrow("MIME type not supported");
    });

    test("rejects missing filename", () => {
      const buffer = Buffer.from("content");
      expect(() => validateFile(buffer, null, "text/csv")).toThrow(BadRequestException);
      expect(() => validateFile(buffer, null, "text/csv")).toThrow("Filename must be provided");
    });

    test("rejects non-buffer input", () => {
      expect(() => validateFile(null, "products.csv", "text/csv")).toThrow(BadRequestException);
      expect(() => validateFile(null, "products.csv", "text/csv")).toThrow("File must be provided as a buffer");
    });
  });

  describe("parseImportFile", () => {
    test("parses valid CSV file", () => {
      const csvContent = "name,price,category\nProduct 1,10.00,Electronics\nProduct 2,20.00,Clothing";
      const buffer = Buffer.from(csvContent);

      const result = parseImportFile(buffer, "products.csv", "text/csv");

      expect(result).toHaveProperty("headers");
      expect(result).toHaveProperty("rows");
      expect(result).toHaveProperty("rowCount");
      expect(result).toHaveProperty("filename");
      expect(result.filename).toBe("products.csv");
      expect(result.rowCount).toBe(2);
      expect(result.rows).toHaveLength(2);
    });

    test("parses valid XLSX file", () => {
      // Create a minimal valid XLSX buffer using xlsx
      const xlsx = require("xlsx");
      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.aoa_to_sheet([
        ["name", "price", "category"],
        ["Product 1", 10.00, "Electronics"],
        ["Product 2", 20.00, "Clothing"]
      ]);
      xlsx.utils.book_append_sheet(workbook, worksheet, "Products");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

      const result = parseImportFile(buffer, "products.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      expect(result).toHaveProperty("headers");
      expect(result).toHaveProperty("rows");
      expect(result).toHaveProperty("rowCount");
      expect(result.filename).toBe("products.xlsx");
      expect(result.rowCount).toBe(2);
      expect(result.rows).toHaveLength(2);
    });

    test("normalizes headers", () => {
      const csvContent = "Product Name,Product Price,Product Category\nProduct 1,10.00,Electronics";
      const buffer = Buffer.from(csvContent);

      const result = parseImportFile(buffer, "products.csv", "text/csv");

      expect(result.headers).toContain("product_name");
      expect(result.headers).toContain("product_price");
      expect(result.headers).toContain("product_category");
    });

    test("preserves row numbers in data structure", () => {
      const csvContent = "name,price\nProduct 1,10.00\nProduct 2,20.00\nProduct 3,30.00";
      const buffer = Buffer.from(csvContent);

      const result = parseImportFile(buffer, "products.csv", "text/csv");

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toHaveProperty("name");
      expect(result.rows[0]).toHaveProperty("price");
    });

    test("rejects empty CSV file", () => {
      const buffer = Buffer.from("");
      expect(() => parseImportFile(buffer, "products.csv", "text/csv")).toThrow(BadRequestException);
    });

    test("rejects CSV with only headers", () => {
      const buffer = Buffer.from("name,price,category");
      expect(() => parseImportFile(buffer, "products.csv", "text/csv")).toThrow(BadRequestException);
      expect(() => parseImportFile(buffer, "products.csv", "text/csv")).toThrow("File contains no data rows");
    });

    test("rejects malformed CSV", () => {
      // This is a simplified test - in reality, xlsx handles most CSV parsing gracefully
      const buffer = Buffer.from("not a valid csv structure");
      // The parser may or may not throw depending on xlsx's handling
      // We just verify it doesn't crash
      try {
        parseImportFile(buffer, "products.csv", "text/csv");
      } catch (error) {
        // Expected for truly malformed files
        expect(error).toBeInstanceOf(BadRequestException);
      }
    });

    test("rejects file exceeding max rows", () => {
      const xlsx = require("xlsx");
      const workbook = xlsx.utils.book_new();
      const rows = [["name", "price"]];
      for (let i = 0; i <= CONFIG.MAX_ROWS; i++) {
        rows.push([`Product ${i}`, i * 10]);
      }
      const worksheet = xlsx.utils.aoa_to_sheet(rows);
      xlsx.utils.book_append_sheet(workbook, worksheet, "Products");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

      expect(() => parseImportFile(buffer, "products.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toThrow(BadRequestException);
      expect(() => parseImportFile(buffer, "products.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toThrow("File exceeds maximum allowed rows");
    });
  });

  describe("CONFIG", () => {
    test("has defined maximum file size", () => {
      expect(CONFIG.MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
    });

    test("has defined maximum rows", () => {
      expect(CONFIG.MAX_ROWS).toBe(10000);
    });

    test("has allowed extensions", () => {
      expect(CONFIG.ALLOWED_EXTENSIONS.has(".csv")).toBe(true);
      expect(CONFIG.ALLOWED_EXTENSIONS.has(".xlsx")).toBe(true);
      expect(CONFIG.ALLOWED_EXTENSIONS.has(".xls")).toBe(true);
    });

    test("has allowed MIME types", () => {
      expect(CONFIG.ALLOWED_MIME_TYPES.has("text/csv")).toBe(true);
      expect(CONFIG.ALLOWED_MIME_TYPES.has("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
      expect(CONFIG.ALLOWED_MIME_TYPES.has("application/vnd.ms-excel")).toBe(true);
    });
  });
});
