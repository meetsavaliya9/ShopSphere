"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPaginationItems, getPaginationRange } from "../../lib/pagination";

const PAGE_SIZE = 10;
const BUTTON_SIZE = "36px";
const BUTTON_GAP = "6px";

export default function AdminPagination({
  currentPage,
  totalItems,
  onPageChange,
  pageSize = PAGE_SIZE
}) {
  const paginationInfo = getPaginationRange(currentPage, pageSize, totalItems);
  const { startItem, endItem, isFirstPage, isLastPage, totalPages } = paginationInfo;
  const paginationItems = getPaginationItems(currentPage, totalPages);

  if (totalItems === 0) return null;

  return (
    <div className="mt-6 flex flex-col items-center sm:flex-row sm:items-start w-full gap-2 sm:gap-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      {/* Item count label - left aligned on desktop, centered on mobile */}
      <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center sm:text-left">
        Showing {startItem}–{endItem} of {totalItems} items
      </p>

      {/* Pagination controls - centered independently */}
      {totalPages > 1 && (
        <nav className="mx-auto flex flex-wrap items-center justify-center gap-1 sm:gap-6" aria-label="Pagination">
          {/* Previous button */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={isFirstPage}
            aria-label="Previous page"
            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:text-zinc-400 disabled:opacity-50 enabled:text-zinc-700 enabled:hover:text-zinc-900 dark:enabled:text-zinc-300 dark:enabled:hover:text-zinc-100 dark:border-zinc-800"
            style={{ height: BUTTON_SIZE }}
          >
            <ChevronLeft size={14} />
            <span className="ml-1">Previous</span>
          </button>

          {/* Numbered page buttons */}
          <div className="flex items-center gap-1 sm:gap-6">
            {paginationItems.map((item, idx) => {
              if (item === "...") {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="inline-flex items-center justify-center text-xs font-bold text-zinc-400 select-none"
                    style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
                    aria-hidden="true"
                  >
                    …
                  </span>
                );
              }
              const isCurrent = item === currentPage;
              return (
                <button
                  key={`page-${item}`}
                  type="button"
                  onClick={() => onPageChange(item)}
                  disabled={isCurrent}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={isCurrent ? `Page ${item}, current page` : `Go to page ${item}`}
                  className={`inline-flex items-center justify-center rounded-full text-xs font-semibold transition-all ${
                    isCurrent
                      ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                  style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
                >
                  {item}
                </button>
              );
            })}
          </div>

          {/* Next button */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={isLastPage}
            aria-label="Next page"
            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:text-zinc-400 disabled:opacity-50 enabled:text-zinc-700 enabled:hover:text-zinc-900 dark:enabled:text-zinc-300 dark:enabled:hover:text-zinc-100 dark:border-zinc-800"
            style={{ height: BUTTON_SIZE }}
          >
            <span className="mr-1">Next</span>
            <ChevronRight size={14} />
          </button>
        </nav>
      )}
    </div>
  );
}

export { PAGE_SIZE };
