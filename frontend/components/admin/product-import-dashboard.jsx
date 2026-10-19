"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  Download,
  X,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Search,
  Filter,
  Package,
  Database,
  AlertTriangle,
  LoaderCircle,
  FileText,
  RefreshCw,
  Edit2,
  Eye,
  Check,
  Info,
  ChevronDown,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckSquare,
  Square,
  FileCheck,
} from "lucide-react";
import { authRequest } from "../../lib/api/auth";
import { isAllowedImageSrc } from "../../lib/image-url";
import { useAuth } from "../auth-provider";
import { StatCard } from "./stat-card";
import { Badge } from "./badge";
import { Modal } from "./modal";
import AdminPagination from "./admin-pagination";

const STEPS = [
  { step: 1, label: "Upload File", desc: "Select CSV or Excel sheet" },
  { step: 2, label: "Analyze & Validate", desc: "Scan schema & conflicts" },
  { step: 3, label: "Review & Edit", desc: "Inspect, filter & fix" },
  { step: 4, label: "Import Products", desc: "Commit to catalog database" },
];

function downloadSampleTemplateCSV() {
  const headers = [
    "Product Name",
    "Category",
    "Price",
    "Description",
    "Image URL",
    "Stock Quantity",
    "Low Stock Threshold",
  ];
  const sampleRows = [
    "Wireless Noise-Canceling Headphones,Electronics,12999.00,Premium over-ear headphones with active noise cancellation and 30-hour battery life.,https://images.unsplash.com/photo-1505740420928-5e560c06d30e,45,10",
    "Organic Cotton Classic Tee,Apparel,999.00,Breathable 100% organic cotton t-shirt with reinforced stitching.,https://images.unsplash.com/photo-1521572267360-ee0c2909d518,120,25",
    "Stainless Steel Water Bottle,Fitness,749.50,Double-walled vacuum insulated 750ml flask keeping drinks cold for 24 hours.,https://images.unsplash.com/photo-1602143407151-7111542de6e8,80,15",
    "Ceramic Pour-Over Coffee Dripper,Kitchen,1499.00,Handcrafted ceramic dripper for artisanal pour-over brewing.,https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd,30,5",
    "Minimalist Desk Organizer,Office,899.00,Compact bamboo desk organizer with phone stand and cable management.,,50,10",
  ];

  const csv = "\uFEFF" + [headers.join(","), ...sampleRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "shopsphere-product-import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function downloadSampleTemplateXLSX(role = "admin") {
  try {
    const endpoint = `/api/${role}/products/import/template?format=xlsx`;
    const response = await fetch(endpoint, {
      method: "GET",
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error(`Failed to download template (${response.status})`);
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "shopsphere-product-import-template.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  } catch {
    downloadSampleTemplateCSV();
  }
}

function downloadErrorReport(rows, importResults) {
  const headers = [
    "Row Number",
    "SKU",
    "Product Name",
    "Category",
    "Status",
    "Validation Errors / Failure Reason",
    "Duplicate Source / Details",
  ];

  const serverErrorMap = new Map();
  if (importResults?.errors && Array.isArray(importResults.errors)) {
    importResults.errors.forEach((err) => {
      serverErrorMap.set(err.row, err);
    });
  }

  const exportRows = (rows || [])
    .filter(
      (r) =>
        r.status === "invalid" ||
        r.status === "duplicate" ||
        serverErrorMap.has(r.rowNumber),
    )
    .map((r) => {
      const serverErr = serverErrorMap.get(r.rowNumber);
      const errorList = [...(r.errors || [])];
      if (serverErr && serverErr.error) {
        errorList.push(serverErr.error);
      }
      const isDuplicate =
        r.status === "duplicate" ||
        serverErr?.type === "duplicate" ||
        /duplicate|already exists/i.test(serverErr?.error || "");
      const statusLabel = isDuplicate
        ? "SKIPPED_DUPLICATE"
        : (r.status || "FAILED").toUpperCase();
      const skuVal = r.data?.sku || r.rawData?.sku || serverErr?.sku || "";

      return [
        r.rowNumber,
        skuVal,
        r.data?.name || r.rawData?.name || "",
        r.data?.category || r.rawData?.category || "",
        statusLabel,
        errorList.join(" | ") || (isDuplicate ? "Duplicate skipped" : "Failed"),
        r.duplicateReason ||
          (serverErr?.type === "duplicate"
            ? "Catalog duplicate"
            : serverErr?.field
              ? `Field: ${serverErr.field}`
              : ""),
      ];
    });

  if (exportRows.length === 0) return;

  const csv =
    "\uFEFF" +
    [
      headers.join(","),
      ...exportRows.map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `shopsphere-import-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function validateRowClient(data, rowNumber, existingRows) {
  const errors = [];
  const warnings = [];

  // Name
  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push("Product name is required and cannot be empty");
  } else if (data.name.trim().length > 191) {
    errors.push("Product name exceeds maximum length of 191 characters");
  }

  // Category
  if (!data.category || typeof data.category !== "string" || !data.category.trim()) {
    errors.push("Category is required and cannot be empty");
  } else if (data.category.trim().length > 100) {
    errors.push("Category exceeds maximum length of 100 characters");
  }

  // Price
  const numPrice = Number(data.price);
  if (
    data.price === undefined ||
    data.price === null ||
    data.price === "" ||
    !Number.isFinite(numPrice)
  ) {
    errors.push("Price must be a valid number");
  } else if (numPrice < 0) {
    errors.push("Price cannot be negative");
  } else if (numPrice > 99999999.99) {
    errors.push("Price exceeds maximum allowed value of 99999999.99");
  }

  // Stock Quantity
  if (
    data.stockQuantity !== undefined &&
    data.stockQuantity !== null &&
    data.stockQuantity !== ""
  ) {
    const numStock = Number(data.stockQuantity);
    if (!Number.isFinite(numStock) || !Number.isSafeInteger(numStock) || numStock < 0) {
      errors.push("Stock quantity must be a non-negative whole number");
    }
  }

  // Low Stock Threshold
  if (
    data.lowStockThreshold !== undefined &&
    data.lowStockThreshold !== null &&
    data.lowStockThreshold !== ""
  ) {
    const numThreshold = Number(data.lowStockThreshold);
    if (
      !Number.isFinite(numThreshold) ||
      !Number.isSafeInteger(numThreshold) ||
      numThreshold < 0
    ) {
      errors.push("Low stock threshold must be a non-negative whole number");
    }
  }

  // Image URL
  if (data.imageUrl && typeof data.imageUrl === "string" && data.imageUrl.trim() !== "") {
    if (data.imageUrl.trim().length > 2048) {
      errors.push("Image URL exceeds maximum length of 2048 characters");
    } else if (!isAllowedImageSrc(data.imageUrl.trim())) {
      errors.push("Image URL hostname is not configured (allowed: images.unsplash.com, res.cloudinary.com)");
    }
  }

  // SKU validation
  if (data.sku !== undefined && data.sku !== null && data.sku !== "") {
    if (typeof data.sku !== "string" && typeof data.sku !== "number") {
      errors.push("SKU must be text");
    } else if (String(data.sku).trim().length > 100) {
      errors.push("SKU exceeds maximum length of 100 characters");
    }
  }

  if (errors.length > 0) {
    return {
      status: "invalid",
      errors,
      warnings,
      duplicateSource: null,
      duplicateReason: null,
    };
  }

  // Check duplicate in file by exact normalized name and category
  const normName = data.name.trim().toLowerCase();
  const normCategory = data.category.trim().toLowerCase();
  const dupRow = existingRows.find(
    (r) =>
      r.rowNumber !== rowNumber &&
      r.data?.name?.trim().toLowerCase() === normName &&
      r.data?.category?.trim().toLowerCase() === normCategory,
  );

  if (dupRow) {
    return {
      status: "duplicate",
      errors: [],
      warnings,
      duplicateSource: "uploaded_file",
      duplicateReason: `Duplicate of row ${dupRow.rowNumber} (same name and category)`,
    };
  }

  // Check duplicate in file by canonical slug and category
  const toSlug = (s) =>
    (s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const slug = toSlug(data.name);
  if (slug) {
    const dupSlugRow = existingRows.find(
      (r) =>
        r.rowNumber !== rowNumber &&
        r.data?.name &&
        toSlug(r.data.name) === slug &&
        r.data?.category?.trim().toLowerCase() === normCategory,
    );
    if (dupSlugRow) {
      return {
        status: "duplicate",
        errors: [],
        warnings,
        duplicateSource: "uploaded_file",
        duplicateReason: `Duplicate of row ${dupSlugRow.rowNumber} (same product slug/name)`,
      };
    }
  }

  // Check duplicate in file by SKU
  if (data.sku) {
    const normSku = String(data.sku).trim().toLowerCase();
    if (normSku) {
      const dupSkuRow = existingRows.find(
        (r) =>
          r.rowNumber !== rowNumber &&
          r.data?.sku &&
          String(r.data.sku).trim().toLowerCase() === normSku,
      );
      if (dupSkuRow) {
        return {
          status: "duplicate",
          errors: [],
          warnings,
          duplicateSource: "uploaded_file",
          duplicateReason: `Duplicate of row ${dupSkuRow.rowNumber} (same SKU: ${String(data.sku).trim()})`,
        };
      }
    }
  }

  return {
    status: "valid",
    errors: [],
    warnings,
    duplicateSource: null,
    duplicateReason: null,
  };
}

export function ProductImportDashboard({ role = "admin" }) {
  const { csrfToken } = useAuth();
  const fileInputRef = useRef(null);

  // Workflow steps: "upload" (Step 1), "analyzing" (Step 2), "review" (Step 3), "importing" (Step 4), "complete" (Step 4 done)
  const [currentStep, setCurrentStep] = useState("upload");
  const [file, setFile] = useState(null);
  const [fileStats, setFileStats] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Analyzed data & rows
  const [parsedData, setParsedData] = useState(null);
  const [rows, setRows] = useState([]);

  // Filters & Search in Step 3
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Row edit & details modal
  const [editingRow, setEditingRow] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editErrors, setEditErrors] = useState([]);
  const [viewingRow, setViewingRow] = useState(null);

  // Import execution
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState(null);

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    const validExtensions = [".csv", ".xlsx", ".xls"];
    const hasValidExt = validExtensions.some((ext) =>
      selectedFile.name.toLowerCase().endsWith(ext),
    );

    if (!hasValidExt) {
      setUploadError("Please select a CSV or Excel spreadsheet (.csv, .xlsx, .xls)");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setUploadError("File size exceeds 5MB limit. Please upload a smaller file.");
      return;
    }

    setFile(selectedFile);
    setUploadError("");

    const ext = selectedFile.name.split(".").pop().toUpperCase();
    setFileStats({
      name: selectedFile.name,
      size: (selectedFile.size / 1024).toFixed(1) + " KB",
      format: ext,
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    handleFileSelect(droppedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // Step 1 -> Step 2 -> Step 3: Analyze & Validate File
  const handleAnalyze = async () => {
    if (!file) return;

    setCurrentStep("analyzing");
    setUploadError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const endpoint =
        role === "admin"
          ? "/api/admin/products/import/preview"
          : "/api/manager/products/import/preview";

      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: formData,
      });

      let result = null;
      let rawText = "";
      try {
        rawText = await response.text();
        result = rawText ? JSON.parse(rawText) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        const serverMessage =
          (result?.headerValidation?.missingRequired?.length
            ? `Missing required headers: ${result.headerValidation.missingRequired.join(", ")}`
            : null) ||
          result?.error?.message ||
          result?.message ||
          (rawText && !rawText.startsWith("<") && !rawText.startsWith("{") && rawText.length < 300
            ? rawText.trim()
            : null);
        throw new Error(serverMessage || `Failed to parse file (${response.status})`);
      }

      if (!result) {
        throw new Error("The server returned an unreadable response.");
      }

      if (!result.success) {
        throw new Error(
          result.headerValidation?.missingRequired?.length
            ? `Missing required fields: ${result.headerValidation.missingRequired.join(", ")}`
            : result.error?.message || result.message || "Invalid file format",
        );
      }

      setParsedData(result);

      // Enhance rows with excluded flag
      const preparedRows = (result.rowResults || []).map((row) => ({
        ...row,
        excluded: false,
      }));
      setRows(preparedRows);

      if (fileStats) {
        setFileStats((prev) => ({
          ...prev,
          rowCount: preparedRows.length,
        }));
      }

      // Small delay for smooth visual transition
      setTimeout(() => {
        setCurrentStep("review");
        setCurrentPage(1);
      }, 500);
    } catch (error) {
      setUploadError(error.message || "Failed to analyze file");
      setCurrentStep("upload");
    }
  };

  // Unique categories in analyzed data
  const availableCategories = useMemo(() => {
    const cats = new Set();
    rows.forEach((r) => {
      const cat = r.data?.category || r.rawData?.category;
      if (cat && typeof cat === "string") cats.add(cat.trim());
    });
    return Array.from(cats).sort();
  }, [rows]);

  // Derived Summary Counts (recomputed dynamically when rows are edited/excluded)
  const dynamicSummary = useMemo(() => {
    let valid = 0;
    let invalid = 0;
    let duplicate = 0;
    let excluded = 0;

    rows.forEach((r) => {
      if (r.excluded) {
        excluded++;
      } else if (r.status === "valid") {
        valid++;
      } else if (r.status === "duplicate") {
        duplicate++;
      } else if (r.status === "invalid") {
        invalid++;
      }
    });

    return {
      total: rows.length,
      valid,
      invalid,
      duplicate,
      excluded,
      eligibleForImport: valid,
    };
  }, [rows]);

  // Filtered rows for Step 3 Review table
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Status filter
      if (statusFilter === "VALID" && (row.status !== "valid" || row.excluded)) return false;
      if (statusFilter === "INVALID" && (row.status !== "invalid" || row.excluded)) return false;
      if (statusFilter === "DUPLICATE" && (row.status !== "duplicate" || row.excluded)) return false;
      if (statusFilter === "EXCLUDED" && !row.excluded) return false;

      // Category filter
      if (categoryFilter !== "ALL") {
        const cat = row.data?.category || row.rawData?.category;
        if (cat !== categoryFilter) return false;
      }

      // Search (by name, category, or sku/id)
      if (search.trim()) {
        const q = search.toLowerCase();
        const name = (row.data?.name || row.rawData?.name || "").toLowerCase();
        const cat = (row.data?.category || row.rawData?.category || "").toLowerCase();
        const sku = (row.data?.sku || row.rawData?.sku || "").toLowerCase();
        const desc = (row.data?.description || row.rawData?.description || "").toLowerCase();
        const rowStr = String(row.rowNumber);

        if (
          !name.includes(q) &&
          !cat.includes(q) &&
          !sku.includes(q) &&
          !desc.includes(q) &&
          !rowStr.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [rows, statusFilter, categoryFilter, search]);

  // Paginated slice
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Row exclusion toggles
  const toggleRowExcluded = (rowNumber) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rowNumber === rowNumber ? { ...r, excluded: !r.excluded } : r,
      ),
    );
  };

  const excludeAllDuplicates = () => {
    setRows((prev) =>
      prev.map((r) =>
        r.status === "duplicate" ? { ...r, excluded: true } : r,
      ),
    );
  };

  const includeAllRows = () => {
    setRows((prev) => prev.map((r) => ({ ...r, excluded: false })));
  };

  // In-line Row Editing
  const openEditModal = (row) => {
    setEditingRow(row);
    setEditFormData({
      name: row.data?.name || row.rawData?.name || "",
      category: row.data?.category || row.rawData?.category || "",
      price: row.data?.price ?? row.rawData?.price ?? "",
      stockQuantity: row.data?.stockQuantity ?? row.rawData?.stockQuantity ?? "",
      lowStockThreshold: row.data?.lowStockThreshold ?? row.rawData?.lowStockThreshold ?? "",
      description: row.data?.description || row.rawData?.description || "",
      imageUrl: row.data?.imageUrl || row.rawData?.imageUrl || "",
    });
    setEditErrors(row.errors || []);
  };

  const handleSaveRowEdit = () => {
    if (!editingRow) return;

    const updatedData = {
      ...editingRow.data,
      name: editFormData.name?.trim(),
      category: editFormData.category?.trim(),
      price: editFormData.price !== "" ? Number(editFormData.price) : "",
      stockQuantity:
        editFormData.stockQuantity !== "" && editFormData.stockQuantity !== null
          ? Number(editFormData.stockQuantity)
          : null,
      lowStockThreshold:
        editFormData.lowStockThreshold !== "" && editFormData.lowStockThreshold !== null
          ? Number(editFormData.lowStockThreshold)
          : null,
      description: editFormData.description?.trim() || "",
      imageUrl: editFormData.imageUrl?.trim() || null,
    };

    // Revalidate against schema & duplicate rules
    const validation = validateRowClient(updatedData, editingRow.rowNumber, rows);

    setRows((prev) =>
      prev.map((r) => {
        if (r.rowNumber === editingRow.rowNumber) {
          return {
            ...r,
            data: updatedData,
            status: validation.status,
            errors: validation.errors,
            warnings: validation.warnings,
            duplicateSource: validation.duplicateSource,
            duplicateReason: validation.duplicateReason,
          };
        }
        return r;
      }),
    );

    setEditingRow(null);
  };

  // Step 3 -> Step 4: Import Valid Products
  const handleImport = async () => {
    const validRowsToImport = rows
      .filter((r) => r.status === "valid" && !r.excluded)
      .map((r) => ({
        rowNumber: r.rowNumber,
        ...r.data,
      }));

    if (validRowsToImport.length === 0) return;

    setCurrentStep("importing");
    setImportProgress(15);
    setUploadError("");

    try {
      const endpoint =
        role === "admin" ? "admin/products/import" : "manager/products/import";

      // Simulated progression tick
      const progressTimer = setInterval(() => {
        setImportProgress((p) => (p < 85 ? p + 15 : p));
      }, 350);

      const response = await authRequest(endpoint, {
        method: "POST",
        body: { products: validRowsToImport },
        csrfToken,
        includeEnvelope: true,
      });

      clearInterval(progressTimer);
      setImportProgress(100);

      const results = response?.results || response?.data?.results || response;
      setImportResults(results);

      setTimeout(() => {
        setCurrentStep("complete");
      }, 400);
    } catch (error) {
      setUploadError(error.message || "Failed to import products");
      setCurrentStep("review");
    }
  };

  const handleReset = () => {
    setFile(null);
    setFileStats(null);
    setUploadError("");
    setParsedData(null);
    setRows([]);
    setImportResults(null);
    setImportProgress(0);
    setCurrentStep("upload");
    setCurrentPage(1);
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
    setSearch("");
  };

  // Active step index
  const activeStepNumber =
    currentStep === "upload"
      ? 1
      : currentStep === "analyzing"
        ? 2
        : currentStep === "review"
          ? 3
          : 4;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link
            href={role === "admin" ? "/admin/products" : "/manager/products"}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft size={14} />
            Products
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Import Products
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Upload, validate, review, and import products in bulk into your catalog.
            </p>
          </div>
        </div>

        {currentStep !== "upload" && currentStep !== "analyzing" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={currentStep === "importing"}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw size={14} />
              Import Another File
            </button>
          </div>
        )}
      </div>

      {/* 4-Step Visual Progress Stepper */}
      <nav aria-label="Import Workflow Steps" className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s) => {
            const isCompleted = activeStepNumber > s.step;
            const isCurrent = activeStepNumber === s.step;
            const isPending = activeStepNumber < s.step;

            return (
              <li
                key={s.step}
                className={`relative flex items-center gap-3.5 p-3 rounded-lg border transition-all ${
                  isCurrent
                    ? "border-zinc-900 bg-zinc-50 shadow-xs dark:border-zinc-100 dark:bg-zinc-900"
                    : isCompleted
                      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-950 dark:bg-emerald-950/20"
                      : "border-zinc-200 bg-transparent opacity-75 dark:border-zinc-850"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    isCompleted
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {isCompleted ? <Check size={16} strokeWidth={2.5} /> : s.step}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-semibold tracking-tight truncate ${
                      isCurrent
                        ? "text-zinc-900 dark:text-zinc-100"
                        : isCompleted
                          ? "text-emerald-900 dark:text-emerald-300"
                          : "text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {s.label}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {s.desc}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Global Error Alert */}
      {uploadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-3 shadow-xs dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 animate-in fade-in">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="space-y-1">
            <p className="font-semibold">Unable to process file</p>
            <p>{uploadError}</p>
          </div>
        </div>
      )}

      {/* STEP 1: Upload File & Guidelines */}
      {currentStep === "upload" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              Select or Drop File
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Upload a spreadsheet with your product inventory. We support standard CSV and Excel formats.
            </p>

            {/* Drag & Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all ${
                isDragging
                  ? "border-zinc-900 bg-zinc-100/60 dark:border-zinc-100 dark:bg-zinc-900/50"
                  : file
                    ? "border-emerald-300 bg-emerald-50/20 dark:border-emerald-800"
                    : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-700 bg-zinc-50/40 dark:bg-zinc-900/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                className="hidden"
              />

              {!file ? (
                <div className="space-y-4 max-w-md mx-auto">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                    <FileSpreadsheet size={32} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Drag and drop your product spreadsheet here
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      or click the button below to browse your computer
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                  >
                    <Upload size={14} />
                    Browse Files
                  </button>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    Supported formats: CSV, XLSX, XLS · Max file size: 5MB · Max rows: 10,000
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-w-md mx-auto">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={32} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {fileStats?.name}
                      </span>
                      <Badge variant="outline">{fileStats?.format}</Badge>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Size: {fileStats?.size} · Ready for analysis
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setFileStats(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      <X size={14} />
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      Change File
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions of Step 1 */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={downloadSampleTemplateCSV}
                  className="inline-flex items-center gap-1.5 text-zinc-700 hover:text-zinc-900 font-semibold dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors"
                >
                  <Download size={14} />
                  Download Sample CSV
                </button>
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                <button
                  type="button"
                  onClick={() => downloadSampleTemplateXLSX(role)}
                  className="inline-flex items-center gap-1.5 text-zinc-700 hover:text-zinc-900 font-semibold dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors"
                >
                  <Download size={14} />
                  Download Sample Excel (XLSX)
                </button>
              </div>

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!file}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors w-full sm:w-auto justify-center"
              >
                Analyze & Validate File
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Guidelines & Product Schema Panel */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
              <Info size={16} className="text-zinc-500" />
              File Format Guidelines & Product Schema
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-3">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider text-[11px]">
                  Required Columns
                </p>
                <div className="space-y-2 border-l-2 border-zinc-900 pl-3 dark:border-zinc-100">
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Product Name
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400"> (Header: name, product_name)</span>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Required text, maximum 191 characters.
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Category
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400"> (Header: category, category_name)</span>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Required text, maximum 100 characters.
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Price
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400"> (Header: price, amount)</span>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Required positive decimal number (e.g. 99.99 or 1499).
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider text-[11px]">
                  Supported Optional Columns
                </p>
                <div className="space-y-2 border-l-2 border-zinc-300 pl-3 dark:border-zinc-700">
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Description
                    </span>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      Optional text for product details & specifications.
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Image URL & Public ID
                    </span>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      Optional URL to product image and Cloudinary/asset public ID.
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Stock Quantity & Threshold
                    </span>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      Optional integer quantity and threshold for low-stock alerts.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Analyzing & Validating File */}
      {currentStep === "analyzing" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="max-w-md mx-auto space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50 animate-pulse">
              <LoaderCircle size={32} className="animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Analyzing & Validating File
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Parsing spreadsheet rows, validating schema data types, and checking for duplicate records...
              </p>
            </div>
            <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
              <div className="h-full bg-zinc-900 dark:bg-zinc-100 animate-pulse w-3/4 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Review & Edit Before Import */}
      {currentStep === "review" && (
        <div className="space-y-6">
          {/* Analysis Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Products"
              value={dynamicSummary.total}
              description="Parsed from spreadsheet"
              icon={FileText}
            />
            <StatCard
              title="Valid Products"
              value={dynamicSummary.valid}
              description={
                dynamicSummary.excluded > 0
                  ? `${dynamicSummary.eligibleForImport} eligible (${dynamicSummary.excluded} excluded)`
                  : "Ready for catalog import"
              }
              icon={CheckCircle2}
              className="border-emerald-200 dark:border-emerald-950/60"
            />
            <StatCard
              title="Products with Errors"
              value={dynamicSummary.invalid}
              description="Must be corrected or excluded"
              icon={AlertTriangle}
              className="border-rose-200 dark:border-rose-950/60"
            />
            <StatCard
              title="Duplicate Products"
              value={dynamicSummary.duplicate}
              description="Will be skipped to prevent duplicates"
              icon={Database}
              className="border-amber-200 dark:border-amber-950/60"
            />
          </div>

          {/* Duplicate Policy Explanation Banner */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
            <Database size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="font-semibold">Duplicate Policy & Resolution</p>
              <p className="text-amber-700 dark:text-amber-300 leading-relaxed">
                Products matching existing database records or earlier entries in this file are flagged as duplicates. They will be skipped during import to protect catalog data. You can edit their name/category to make them unique, or exclude them from import.
              </p>
            </div>
          </div>

          {/* Filter, Search & Action Bar */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-950 space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-100 rounded-lg dark:bg-zinc-900 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("ALL");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    statusFilter === "ALL"
                      ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  All ({dynamicSummary.total})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("VALID");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    statusFilter === "VALID"
                      ? "bg-white text-emerald-700 shadow-xs dark:bg-zinc-800 dark:text-emerald-400"
                      : "text-zinc-600 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
                  }`}
                >
                  Valid ({dynamicSummary.valid})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("INVALID");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    statusFilter === "INVALID"
                      ? "bg-white text-rose-700 shadow-xs dark:bg-zinc-800 dark:text-rose-400"
                      : "text-zinc-600 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400"
                  }`}
                >
                  Errors ({dynamicSummary.invalid})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("DUPLICATE");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    statusFilter === "DUPLICATE"
                      ? "bg-white text-amber-700 shadow-xs dark:bg-zinc-800 dark:text-amber-400"
                      : "text-zinc-600 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400"
                  }`}
                >
                  Duplicates ({dynamicSummary.duplicate})
                </button>
                {dynamicSummary.excluded > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("EXCLUDED");
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      statusFilter === "EXCLUDED"
                        ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
                    }`}
                  >
                    Excluded ({dynamicSummary.excluded})
                  </button>
                )}
              </div>

              {/* Right Side Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search name or category..."
                    className="w-48 sm:w-56 rounded-lg border border-zinc-200 bg-transparent pl-9 pr-3 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Category Filter */}
                {availableCategories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="ALL">All Categories</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}

                {/* Export Error Report */}
                {(dynamicSummary.invalid > 0 || dynamicSummary.duplicate > 0) && (
                  <button
                    type="button"
                    onClick={() => downloadErrorReport(rows)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Download size={13} />
                    Export Issues CSV
                  </button>
                )}

                {/* Quick Exclude All Duplicates */}
                {dynamicSummary.duplicate > 0 && (
                  <button
                    type="button"
                    onClick={excludeAllDuplicates}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 transition-colors"
                  >
                    Exclude All Duplicates
                  </button>
                )}
              </div>
            </div>

            {/* Product Preview Table */}
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">
                  <tr>
                    <th className="px-3 py-3 font-semibold text-zinc-600 dark:text-zinc-400 w-12 text-center">
                      Include
                    </th>
                    <th className="px-3 py-3 font-semibold text-zinc-600 dark:text-zinc-400 w-14">
                      Row
                    </th>
                    <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                      Product Name
                    </th>
                    <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                      Category
                    </th>
                    <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                      Price
                    </th>
                    <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                      Stock
                    </th>
                    <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                      Status
                    </th>
                    <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                      Validation / Duplicate Details
                    </th>
                    <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                        No products match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row) => {
                      const isExcluded = row.excluded;
                      const isValid = row.status === "valid";
                      const isInvalid = row.status === "invalid";
                      const isDuplicate = row.status === "duplicate";

                      return (
                        <tr
                          key={row.rowNumber}
                          className={`transition-colors ${
                            isExcluded
                              ? "opacity-50 bg-zinc-50/50 dark:bg-zinc-900/30"
                              : isInvalid
                                ? "bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-50/60"
                                : isDuplicate
                                  ? "bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50/60"
                                  : "hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                          }`}
                        >
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => toggleRowExcluded(row.rowNumber)}
                              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                              title={isExcluded ? "Include in import" : "Exclude from import"}
                            />
                          </td>
                          <td className="px-3 py-3 font-mono text-zinc-500">
                            #{row.rowNumber}
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 max-w-xs truncate">
                            {row.data?.name || row.rawData?.name || "-"}
                          </td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {row.data?.category || row.rawData?.category || "-"}
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                            {row.data?.price !== undefined && row.data?.price !== null && row.data?.price !== ""
                              ? `₹${Number(row.data.price).toFixed(2)}`
                              : row.rawData?.price || "-"}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {row.data?.stockQuantity ?? row.rawData?.stockQuantity ?? "-"}
                          </td>
                          <td className="px-4 py-3">
                            {isExcluded ? (
                              <Badge variant="outline">Excluded</Badge>
                            ) : isValid ? (
                              <Badge variant="success">Valid</Badge>
                            ) : isDuplicate ? (
                              <Badge variant="warning">
                                Duplicate ({row.duplicateSource === "uploaded_file" ? "In File" : "In DB"})
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Error</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-xs text-xs">
                            {row.errors?.length > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 font-medium">
                                {row.errors.join(", ")}
                              </span>
                            ) : row.duplicateReason ? (
                              <span className="text-amber-700 dark:text-amber-400">
                                {row.duplicateReason}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <Check size={12} /> Ready to import
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(row)}
                                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                                title="Edit Row Values"
                              >
                                <Edit2 size={11} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewingRow(row)}
                                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                                title="View Full Row Details"
                              >
                                <Eye size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredRows.length > 0 && (
              <AdminPagination
                currentPage={currentPage}
                totalItems={filteredRows.length}
                pageSize={pageSize}
                onPageChange={(page) => setCurrentPage(page)}
              />
            )}
          </div>

          {/* Bottom Action Footer for Step 3 */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                Ready to import: {dynamicSummary.eligibleForImport} valid products
              </p>
              <p>
                {dynamicSummary.excluded} excluded · {dynamicSummary.duplicate} duplicates skipped · {dynamicSummary.invalid} invalid ignored
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Back to Upload
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={dynamicSummary.eligibleForImport === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                <Package size={14} />
                Import {dynamicSummary.eligibleForImport} Valid Products
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4 (Importing): Live Progress Indicator */}
      {currentStep === "importing" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="max-w-md mx-auto space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
              <LoaderCircle size={32} className="animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Importing Products into Catalog
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Saving valid products, establishing inventory levels, and committing database transactions...
              </p>
            </div>
            <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
              <div
                className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300 rounded-full"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {importProgress}% completed
            </p>
          </div>
        </div>
      )}

      {/* STEP 4 (Complete): Final Server Results & Summary */}
      {currentStep === "complete" && (() => {
        const total = importResults?.total ?? 0;
        const successful = importResults?.successful ?? 0;
        const skipped = importResults?.skipped ?? 0;
        const failed = importResults?.failed ?? 0;
        const overallStatus =
          importResults?.status ||
          (successful === total && total > 0
            ? "success"
            : successful > 0
              ? "partial_success"
              : "failure");

        const duplicateItems = (importResults?.errors || []).filter(
          (err) =>
            err.type === "duplicate" ||
            /duplicate|already exists/i.test(err.error || ""),
        );
        const failureItems = (importResults?.errors || []).filter(
          (err) =>
            err.type !== "duplicate" &&
            !/duplicate|already exists/i.test(err.error || ""),
        );

        const isSuccess = overallStatus === "success";
        const isPartial = overallStatus === "partial_success";

        const bannerBg = isSuccess
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/30"
          : isPartial
            ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/30"
            : "border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/30";

        const iconBg = isSuccess
          ? "bg-emerald-600 text-white"
          : isPartial
            ? "bg-amber-600 text-white"
            : "bg-rose-600 text-white";

        const headingColor = isSuccess
          ? "text-emerald-950 dark:text-emerald-100"
          : isPartial
            ? "text-amber-950 dark:text-amber-100"
            : "text-rose-950 dark:text-rose-100";

        const subColor = isSuccess
          ? "text-emerald-700 dark:text-emerald-300"
          : isPartial
            ? "text-amber-700 dark:text-amber-300"
            : "text-rose-700 dark:text-rose-300";

        const titleText = isSuccess
          ? "Import Process Completed Successfully"
          : isPartial
            ? "Import Completed with Skipped Duplicates"
            : "Import Process Failed";

        const subText = isSuccess
          ? "All valid products have been verified and added to the catalog."
          : isPartial
            ? `Successfully imported ${successful} valid product${successful === 1 ? "" : "s"}. ${skipped} duplicate${skipped === 1 ? "" : "s"} were safely skipped without modifying existing records.`
            : "No products were imported. Please review the duplicate conflicts and validation errors below.";

        return (
          <div className="space-y-6">
            <div className={`rounded-xl border ${bannerBg} p-6 shadow-xs`}>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}
                >
                  {isSuccess ? (
                    <Check size={20} strokeWidth={2.5} />
                  ) : isPartial ? (
                    <AlertTriangle size={20} strokeWidth={2.5} />
                  ) : (
                    <AlertCircle size={20} strokeWidth={2.5} />
                  )}
                </div>
                <div>
                  <h2 className={`text-base font-bold ${headingColor}`}>
                    {titleText}
                  </h2>
                  <p className={`text-xs ${subColor}`}>{subText}</p>
                </div>
              </div>

              {/* Server Result Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                <div className="rounded-lg bg-white p-4 border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Total Processed
                  </p>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1">
                    {total}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-4 border border-emerald-100 dark:border-emerald-900/40 dark:bg-zinc-950">
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    Successfully Imported
                  </p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                    {successful}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-4 border border-amber-100 dark:border-amber-900/40 dark:bg-zinc-950">
                  <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    Duplicates Skipped
                  </p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
                    {skipped}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-4 border border-rose-100 dark:border-rose-900/40 dark:bg-zinc-950">
                  <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                    Failed / Invalid
                  </p>
                  <p className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">
                    {failed}
                  </p>
                </div>
              </div>

              {/* Skipped Duplicates Breakdown */}
              {duplicateItems.length > 0 && (
                <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-zinc-950">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      Skipped Duplicates ({duplicateItems.length}):
                    </h4>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                      Existing records were preserved untouched
                    </span>
                  </div>
                  <ul className="divide-y divide-amber-100 dark:divide-zinc-800 text-xs text-amber-800 dark:text-amber-400">
                    {duplicateItems.map((err, idx) => (
                      <li
                        key={idx}
                        className="py-2 flex items-start justify-between gap-2"
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-semibold font-mono">
                            Row #{err.row}:
                          </span>
                          <span>{err.error}</span>
                        </div>
                        {err.sku && (
                          <span className="font-mono text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded dark:bg-amber-950 dark:text-amber-200 shrink-0">
                            SKU: {err.sku}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Failed Rows list if any */}
              {failureItems.length > 0 && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-white p-4 dark:border-rose-900/50 dark:bg-zinc-950">
                  <h4 className="text-xs font-bold text-rose-800 dark:text-rose-300 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    Validation & System Failures ({failureItems.length}):
                  </h4>
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs text-rose-700 dark:text-rose-400">
                    {failureItems.map((err, idx) => (
                      <li
                        key={idx}
                        className="py-2 flex items-start justify-between gap-2"
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-semibold font-mono">
                            Row #{err.row}:
                          </span>
                          <span>{err.error}</span>
                        </div>
                        {err.field && (
                          <span className="font-mono text-[10px] bg-rose-100 text-rose-900 px-1.5 py-0.5 rounded dark:bg-rose-950 dark:text-rose-200 shrink-0">
                            {err.field}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Complete Screen Actions */}
              <div className="flex flex-wrap items-center justify-end gap-3 mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-800">
                {(importResults?.errors?.length > 0 ||
                  skipped > 0 ||
                  failed > 0) && (
                  <button
                    type="button"
                    onClick={() => downloadErrorReport(rows, importResults)}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    <Download size={14} />
                    Download Error & Duplicate Report
                  </button>
                )}

                <Link
                  href={
                    role === "admin" ? "/admin/products" : "/manager/products"
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                >
                  <Package size={14} />
                  View Catalog Products
                </Link>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <RefreshCw size={14} />
                  Import Another File
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Product Row Modal */}
      {editingRow && (
        <Modal
          isOpen={Boolean(editingRow)}
          onClose={() => setEditingRow(null)}
          title={`Edit Product Row #${editingRow.rowNumber}`}
          description="Update field values below to resolve validation errors. The row will be automatically revalidated upon saving."
          maxWidth="max-w-xl"
        >
          <div className="space-y-4">
            {editErrors.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                <p className="font-semibold mb-1">Current Validation Errors:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {editErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, name: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Category <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.category}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, category: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Price (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editFormData.price}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, price: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Stock Quantity
                </label>
                <input
                  type="number"
                  value={editFormData.stockQuantity}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      stockQuantity: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  value={editFormData.lowStockThreshold}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      lowStockThreshold: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Image URL
                </label>
                <input
                  type="text"
                  value={editFormData.imageUrl}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, imageUrl: e.target.value })
                  }
                  placeholder="https://images.unsplash.com/... (optional)"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editFormData.description}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      description: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRowEdit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Check size={14} />
                Save & Revalidate Row
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View Full Row Details Modal */}
      {viewingRow && (
        <Modal
          isOpen={Boolean(viewingRow)}
          onClose={() => setViewingRow(null)}
          title={`Product Row Details — #${viewingRow.rowNumber}`}
          description="Detailed view of parsed product attributes and validation diagnostics."
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <span className="font-semibold text-zinc-500">Status</span>
              <div>
                {viewingRow.excluded ? (
                  <Badge variant="outline">Excluded from import</Badge>
                ) : viewingRow.status === "valid" ? (
                  <Badge variant="success">Valid for import</Badge>
                ) : viewingRow.status === "duplicate" ? (
                  <Badge variant="warning">
                    Duplicate ({viewingRow.duplicateSource || "Detected"})
                  </Badge>
                ) : (
                  <Badge variant="destructive">Validation Error</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="font-semibold text-zinc-500">Name:</span>
                <span className="col-span-2 font-medium text-zinc-900 dark:text-zinc-100">
                  {viewingRow.data?.name || viewingRow.rawData?.name || "-"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="font-semibold text-zinc-500">Category:</span>
                <span className="col-span-2 text-zinc-900 dark:text-zinc-100">
                  {viewingRow.data?.category || viewingRow.rawData?.category || "-"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="font-semibold text-zinc-500">Price:</span>
                <span className="col-span-2 text-zinc-900 dark:text-zinc-100">
                  {viewingRow.data?.price ? `₹${Number(viewingRow.data.price).toFixed(2)}` : "-"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="font-semibold text-zinc-500">Stock Quantity:</span>
                <span className="col-span-2 text-zinc-900 dark:text-zinc-100">
                  {viewingRow.data?.stockQuantity ?? "-"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="font-semibold text-zinc-500">Low Stock Alert:</span>
                <span className="col-span-2 text-zinc-900 dark:text-zinc-100">
                  {viewingRow.data?.lowStockThreshold ? `Threshold: ${viewingRow.data.lowStockThreshold}` : "Default"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="font-semibold text-zinc-500">Description:</span>
                <span className="col-span-2 text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {viewingRow.data?.description || viewingRow.rawData?.description || "None"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1">
                <span className="font-semibold text-zinc-500">Image URL:</span>
                <span className="col-span-2 break-all text-zinc-600 dark:text-zinc-400">
                  {viewingRow.data?.imageUrl || "None"}
                </span>
              </div>
            </div>

            {viewingRow.errors?.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                <p className="font-semibold mb-1">Errors:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {viewingRow.errors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {viewingRow.duplicateReason && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <p className="font-semibold mb-0.5">Duplicate Information:</p>
                <p>{viewingRow.duplicateReason}</p>
                {viewingRow.existingProductId && (
                  <p className="mt-1 font-mono text-[11px]">
                    Matching database Product ID: {viewingRow.existingProductId}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setViewingRow(null)}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
