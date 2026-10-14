const { BadRequestException, ConflictException } = require("@nestjs/common");

async function applyStockChange(transaction, {
  product,
  newQuantity,
  actorId,
  actionType,
  reason,
  where = { id: product.id },
  lowStockThreshold = product.lowStockThreshold,
  recordHistory = true
}) {
  if (!Number.isSafeInteger(newQuantity) || newQuantity < 0 || newQuantity > 2147483647) {
    throw new BadRequestException("The resulting stock quantity is invalid.");
  }

  const now = new Date();
  const belowThreshold = Number.isSafeInteger(lowStockThreshold) &&
    newQuantity <= lowStockThreshold;
  const alertActive = belowThreshold;
  const lowStockAlertAt = belowThreshold
    ? product.lowStockAlertActive && product.lowStockAlertAt
      ? product.lowStockAlertAt
      : now
    : null;
  const updated = await transaction.product.updateMany({
    where: {
      ...where,
      stockQuantity: product.stockQuantity,
      inStock: product.inStock,
      lowStockThreshold: product.lowStockThreshold
    },
    data: {
      stockQuantity: newQuantity,
      inStock: newQuantity > 0,
      lowStockThreshold,
      lowStockAlertActive: alertActive,
      lowStockAlertAt,
      updatedAt: now
    }
  });
  if (!updated.count) {
    throw new ConflictException("Stock changed concurrently. Refresh and try again.");
  }

  const quantityChanged = product.stockQuantity === null ||
    product.stockQuantity !== newQuantity;
  if (recordHistory && quantityChanged) {
    await transaction.inventorystockhistory.create({
      data: {
        productId: product.id,
        userId: Number.isSafeInteger(Number(actorId)) && Number(actorId) > 0
          ? Number(actorId)
          : null,
        productName: product.name,
        previousQuantity: product.stockQuantity,
        newQuantity,
        quantityChange: product.stockQuantity === null
          ? null
          : newQuantity - product.stockQuantity,
        previousInStock: product.inStock,
        newInStock: newQuantity > 0,
        actionType,
        reason: typeof reason === "string" && reason.trim()
          ? reason.trim().slice(0, 500)
          : null
      }
    });
  }
  return { newQuantity, lowStockAlertActive: alertActive, lowStockAlertAt };
}

module.exports = { applyStockChange };
