const PRODUCT_FIELDS = Object.freeze({
  NAME: "name",
  CATEGORY: "category",
  PRICE: "price"
});

function normalizeForComparison(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function toProductSlug(name) {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateComparisonKey(name, category) {
  const normalizedName = normalizeForComparison(name);
  const normalizedCategory = normalizeForComparison(category);
  return `${normalizedName}|${normalizedCategory}`;
}

function generateSlugComparisonKey(name, category) {
  const slug = toProductSlug(name);
  const normalizedCategory = normalizeForComparison(category);
  return `${slug}|${normalizedCategory}`;
}

function normalizeSku(sku) {
  if (sku === undefined || sku === null || sku === "") return null;
  const str = String(sku).trim().toLowerCase();
  return str || null;
}

function detectFileDuplicates(validationResults) {
  const seenKeys = new Map();
  const seenSlugKeys = new Map();
  const seenSkus = new Map();
  const processedResults = [];

  for (const result of validationResults) {
    if (result.status !== "valid") {
      // Keep invalid rows as-is
      processedResults.push(result);
      continue;
    }

    const data = result.data || {};
    const comparisonKey = generateComparisonKey(data.name, data.category);
    const slugKey = generateSlugComparisonKey(data.name, data.category);
    const skuKey = normalizeSku(data.sku);

    if (seenKeys.has(comparisonKey)) {
      // Duplicate within file by exact normalized name and category
      const firstOccurrence = seenKeys.get(comparisonKey);
      processedResults.push({
        ...result,
        status: "duplicate",
        duplicateSource: "uploaded_file",
        duplicateReason: `Duplicate of row ${firstOccurrence.rowNumber} (same name and category)`,
        existingProductId: null
      });
    } else if (slugKey && seenSlugKeys.has(slugKey)) {
      // Duplicate within file by canonical slug and category
      const firstOccurrence = seenSlugKeys.get(slugKey);
      processedResults.push({
        ...result,
        status: "duplicate",
        duplicateSource: "uploaded_file",
        duplicateReason: `Duplicate of row ${firstOccurrence.rowNumber} (same product slug/name)`,
        existingProductId: null
      });
    } else if (skuKey && seenSkus.has(skuKey)) {
      // Duplicate within file by SKU
      const firstOccurrence = seenSkus.get(skuKey);
      processedResults.push({
        ...result,
        status: "duplicate",
        duplicateSource: "uploaded_file",
        duplicateReason: `Duplicate of row ${firstOccurrence.rowNumber} (same SKU: ${String(data.sku).trim()})`,
        existingProductId: null
      });
    } else {
      seenKeys.set(comparisonKey, result);
      if (slugKey) seenSlugKeys.set(slugKey, result);
      if (skuKey) seenSkus.set(skuKey, result);
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

  // Extract unique names and categories for efficient database query
  const uniqueNames = new Set();
  const uniqueCategories = new Set();
  
  for (const row of validRows) {
    if (row.data?.name) {
      uniqueNames.add(row.data.name);
      if (typeof row.data.name === "string" && row.data.name.trim() !== row.data.name) {
        uniqueNames.add(row.data.name.trim());
      }
    }
    if (row.data?.category) {
      uniqueCategories.add(row.data.category);
      if (typeof row.data.category === "string" && row.data.category.trim() !== row.data.category) {
        uniqueCategories.add(row.data.category.trim());
      }
    }
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

  // Build lookup maps for existing products
  const existingProductMap = new Map();
  const existingProductSlugMap = new Map();
  for (const product of existingProducts) {
    const key = generateComparisonKey(product.name, product.category);
    existingProductMap.set(key, product);
    const slugKey = generateSlugComparisonKey(product.name, product.category);
    existingProductSlugMap.set(slugKey, product);
  }

  // Process results and mark database duplicates
  const processedResults = validationResults.map((result) => {
    if (result.status !== "valid") {
      return result;
    }

    const key = generateComparisonKey(result.data.name, result.data.category);
    const slugKey = generateSlugComparisonKey(result.data.name, result.data.category);
    const existingProduct = existingProductMap.get(key) || existingProductSlugMap.get(slugKey);

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
  generateSlugComparisonKey,
  toProductSlug,
  normalizeSku,
  normalizeForComparison,
  PRODUCT_FIELDS
};
