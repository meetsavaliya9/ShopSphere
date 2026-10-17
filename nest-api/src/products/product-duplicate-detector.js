const PRODUCT_FIELDS = Object.freeze({
  NAME: "name",
  CATEGORY: "category",
  PRICE: "price"
});

function normalizeForComparison(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function generateComparisonKey(name, category) {
  const normalizedName = normalizeForComparison(name);
  const normalizedCategory = normalizeForComparison(category);
  return `${normalizedName}|${normalizedCategory}`;
}

function detectFileDuplicates(validationResults) {
  const seenKeys = new Map();
  const processedResults = [];

  for (const result of validationResults) {
    if (result.status !== "valid") {
      // Keep invalid rows as-is
      processedResults.push(result);
      continue;
    }

    const data = result.data;
    const comparisonKey = generateComparisonKey(data.name, data.category);

    if (seenKeys.has(comparisonKey)) {
      // Duplicate within file
      const firstOccurrence = seenKeys.get(comparisonKey);
      processedResults.push({
        ...result,
        status: "duplicate",
        duplicateSource: "uploaded_file",
        duplicateReason: `Duplicate of row ${firstOccurrence.rowNumber} (same name and category)`,
        existingProductId: null
      });
    } else {
      seenKeys.set(comparisonKey, result);
      processedResults.push(result);
    }
  }

  return processedResults;
}

async function detectDatabaseDuplicates(validationResults, prisma, managerId = null) {
  // Filter valid rows
  const validRows = validationResults.filter((r) => r.status === "valid");
  
  if (validRows.length === 0) {
    return validationResults;
  }

  // Build list of unique comparison keys from valid rows
  const comparisonKeys = new Set();
  const keyToRowMap = new Map();
  
  for (const row of validRows) {
    const key = generateComparisonKey(row.data.name, row.data.category);
    comparisonKeys.add(key);
    keyToRowMap.set(key, row);
  }

  // Extract unique names and categories for efficient database query
  const uniqueNames = new Set();
  const uniqueCategories = new Set();
  
  for (const row of validRows) {
    uniqueNames.add(row.data.name);
    uniqueCategories.add(row.data.category);
  }

  // Build where clause for database query
  const whereClause = {
    OR: [
      ...Array.from(uniqueNames).map((name) => ({ name })),
      ...Array.from(uniqueCategories).map((category) => ({ category }))
    ]
  };

  // Add manager filter if managerId is provided
  if (managerId !== null) {
    whereClause.managerId = Number(managerId);
  }

  // Query existing products that might match
  const existingProducts = await prisma.product.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      category: true,
      managerId: true
    }
  });

  // Build lookup map for existing products
  const existingProductMap = new Map();
  for (const product of existingProducts) {
    const key = generateComparisonKey(product.name, product.category);
    existingProductMap.set(key, product);
  }

  // Process results and mark database duplicates
  const processedResults = validationResults.map((result) => {
    if (result.status !== "valid") {
      return result;
    }

    const key = generateComparisonKey(result.data.name, result.data.category);
    const existingProduct = existingProductMap.get(key);

    if (existingProduct) {
      return {
        ...result,
        status: "duplicate",
        duplicateSource: "existing_database",
        duplicateReason: `Product already exists in database (ID: ${existingProduct.id})`,
        existingProductId: existingProduct.id
      };
    }

    return result;
  });

  return processedResults;
}

async function detectDuplicates(validationResults, prisma, managerId = null) {
  // First detect duplicates within the file
  const afterFileDeduplication = detectFileDuplicates(validationResults);

  // Then detect duplicates against the database
  const afterDatabaseDeduplication = await detectDatabaseDuplicates(
    afterFileDeduplication,
    prisma,
    managerId
  );

  return afterDatabaseDeduplication;
}

function generateDuplicateSummary(results) {
  const summary = {
    total: results.length,
    valid: 0,
    duplicate: 0,
    invalid: 0,
    duplicateBreakdown: {
      withinFile: 0,
      existingDatabase: 0
    }
  };

  for (const result of results) {
    if (result.status === "valid") {
      summary.valid++;
    } else if (result.status === "duplicate") {
      summary.duplicate++;
      if (result.duplicateSource === "uploaded_file") {
        summary.duplicateBreakdown.withinFile++;
      } else if (result.duplicateSource === "existing_database") {
        summary.duplicateBreakdown.existingDatabase++;
      }
    } else {
      summary.invalid++;
    }
  }

  return summary;
}

module.exports = {
  detectDuplicates,
  detectFileDuplicates,
  detectDatabaseDuplicates,
  generateDuplicateSummary,
  generateComparisonKey,
  normalizeForComparison,
  PRODUCT_FIELDS
};
