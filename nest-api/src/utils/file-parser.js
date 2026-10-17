const { BadRequestException } = require("@nestjs/common");
const xlsx = require("xlsx");

const CONFIG = Object.freeze({
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_ROWS: 10000,
  ALLOWED_EXTENSIONS: new Set([".csv", ".xlsx", ".xls"]),
  ALLOWED_MIME_TYPES: new Set([
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel"
  ])
});

function validateFile(buffer, filename, mimeType) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new BadRequestException("File must be provided as a buffer.");
  }

  if (buffer.length === 0) {
    throw new BadRequestException("File is empty.");
  }

  if (buffer.length > CONFIG.MAX_FILE_SIZE) {
    throw new BadRequestException(
      `File size exceeds maximum allowed size of ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB.`
    );
  }

  if (!filename || typeof filename !== "string") {
    throw new BadRequestException("Filename must be provided.");
  }

  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  if (!CONFIG.ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestException(
      `File type not supported. Allowed types: ${[...CONFIG.ALLOWED_EXTENSIONS].join(", ")}.`
    );
  }

  if (mimeType && !CONFIG.ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new BadRequestException(
      `MIME type not supported. Allowed types: ${[...CONFIG.ALLOWED_MIME_TYPES].join(", ")}.`
    );
  }
}

function normalizeHeader(header) {
  if (typeof header !== "string") return "";
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseSheetRows(sheet) {
  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const rows = [];

  for (let row = range.s.r; row <= range.e.r; row++) {
    const rowData = {};
    let hasData = false;

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = xlsx.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];

      if (cell) {
        const headerCell = sheet[xlsx.utils.encode_cell({ r: range.s.r, c: col })];
        const header = headerCell ? headerCell.v : `column_${col}`;
        const normalizedHeader = normalizeHeader(header);

        if (row === range.s.r) {
          // Header row - skip for now, headers extracted separately
          continue;
        }

        rowData[normalizedHeader] = cell.v !== undefined ? cell.v : null;
        hasData = true;
      }
    }

    if (row > range.s.r && hasData) {
      rows.push(rowData);
    }
  }

  return rows;
}

function parseSpreadsheet(buffer, filename) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new BadRequestException("File contains no sheets.");
  }

  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  if (!sheet || !sheet["!ref"]) {
    throw new BadRequestException("Sheet is empty or has no data.");
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const totalRows = range.e.r - range.s.r;

  if (totalRows > CONFIG.MAX_ROWS) {
    throw new BadRequestException(
      `File exceeds maximum allowed rows of ${CONFIG.MAX_ROWS}. Found ${totalRows} data rows.`
    );
  }

  // Extract headers
  const headers = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const headerCell = sheet[xlsx.utils.encode_cell({ r: range.s.r, c: col })];
    const header = headerCell ? headerCell.v : `column_${col}`;
    headers.push(normalizeHeader(header));
  }

  // Extract data rows
  const rows = parseSheetRows(sheet);

  if (rows.length === 0) {
    throw new BadRequestException("File contains no data rows.");
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    filename
  };
}

function parseCSV(buffer, filename) {
  // Use xlsx to parse CSV as well for consistency
  return parseSpreadsheet(buffer, filename);
}

function parseImportFile(buffer, filename, mimeType) {
  validateFile(buffer, filename, mimeType);

  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));

  if (ext === ".csv") {
    return parseCSV(buffer, filename);
  } else if (ext === ".xlsx" || ext === ".xls") {
    return parseSpreadsheet(buffer, filename);
  } else {
    throw new BadRequestException("Unsupported file format.");
  }
}

module.exports = {
  parseImportFile,
  validateFile,
  normalizeHeader,
  CONFIG
};
