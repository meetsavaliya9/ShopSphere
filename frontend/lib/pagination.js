function getPaginationItems(currentPage, totalPages) {
  const current = Math.max(1, Math.min(Number(currentPage) || 1, totalPages));
  const total = Math.max(1, Number(totalPages) || 1);

  if (total <= 1) return [1];

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }

  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, "...", current - 1, current, current + 1, "...", total];
}

function getPaginationRange(currentPage, limit, total) {
  const validTotal = Math.max(0, Number(total) || 0);
  const validLimit = Math.max(1, Number(limit) || 12);
  const totalPages = Math.max(1, Math.ceil(validTotal / validLimit));
  const validPage = Math.max(1, Math.min(Number(currentPage) || 1, totalPages));

  const startItem = validTotal === 0 ? 0 : (validPage - 1) * validLimit + 1;
  const endItem = Math.min(validPage * validLimit, validTotal);

  return {
    page: validPage,
    limit: validLimit,
    total: validTotal,
    totalPages,
    startItem,
    endItem,
    isFirstPage: validPage <= 1,
    isLastPage: validPage >= totalPages
  };
}

module.exports = {
  getPaginationItems,
  getPaginationRange
};
