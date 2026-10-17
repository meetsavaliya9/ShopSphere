"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { authRequest } from "../../lib/api/auth";
import { useAuth } from "../auth-provider";
import { StatCard } from "./stat-card";
import { Badge } from "./badge";

const IMPORT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  IMPORTED: "imported",
  DUPLICATE: "duplicate",
  INVALID: "invalid",
  FAILED: "failed",
};

function downloadSampleTemplate() {
  const headers = [
    "Product Name",
    "Category",
    "Price",
    "Description",
    "Image URL",
    "Image Public ID",
    "Stock Quantity",
    "Low Stock Threshold",
  ];
  const sampleData = [
    headers.join(","),
    "Sample Product,Electronics,99.99,A sample product description,https://example.com/image.jpg,shopsphere/products/sample,100,10",
  ];

  const csv = sampleData.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "shopsphere-product-import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function downloadErrorReport(results) {
  if (!results || !results.errors || results.errors.length === 0) return;

  const headers = ["Row Number", "Original Data", "Error Reason"];
  const rows = results.errors.map((error) => [
    error.row,
    JSON.stringify(error.originalData || {}),
    error.error,
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `shopsphere-import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export function ProductImportDashboard({ role = "admin" }) {
  const { csrfToken } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState("upload"); // upload, preview, processing, complete
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [parsedData, setParsedData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    const validTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (
      !validTypes.includes(selectedFile.type) &&
      !selectedFile.name.endsWith(".csv") &&
      !selectedFile.name.endsWith(".xlsx") &&
      !selectedFile.name.endsWith(".xls")
    ) {
      setUploadError("Please select a CSV or Excel file (.csv, .xlsx, .xls)");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setUploadError("File size must be less than 5MB");
      return;
    }

    setFile(selectedFile);
    setUploadError("");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    handleFileSelect(droppedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const endpoint =
        role === "admin" 
          ? "admin/products/import" 
          : "manager/products/import";

      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message || "Failed to parse file");
      }

      if (!result.success) {
        throw new Error(
          result.headerValidation?.missingRequired?.length
            ? `Missing required fields: ${result.headerValidation.missingRequired.join(", ")}`
            : "Invalid file format",
        );
      }

      setParsedData(result);
      setStep("preview");
    } catch (error) {
      setUploadError(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;

    setImporting(true);
    setImportProgress(0);
    setStep("processing");

    try {
      // Extract valid rows for import
      const validRows = parsedData.rowResults
        .filter((row) => row.status === "valid")
        .map((row) => ({
          rowNumber: row.rowNumber,
          ...row.data,
        }));

      const endpoint =
        role === "admin"
          ? "admin/products/import/preview"
          : "manager/products/import/preview";

      const response = await authRequest(endpoint, {
        method: "POST",
        body: { products: validRows },
        csrfToken,
      });

      setImportResults(response.results);
      setImportProgress(100);
      setStep("complete");
    } catch (error) {
      setUploadError(error.message || "Failed to import products");
      setStep("preview");
    } finally {
      setImporting(false);
    }
  };

  // Calculate valid rows count for display
  const validRowsCount =
    parsedData?.rowResults?.filter((row) => row.status === "valid").length || 0;

  const handleReset = () => {
    setFile(null);
    setUploadError("");
    setParsedData(null);
    setImportResults(null);
    setImportProgress(0);
    setStep("upload");
  };

  // Filter rows based on search and status
  const filteredRows =
    parsedData?.rowResults?.filter((row) => {
      const matchesSearch =
        !search ||
        row.data?.name?.toLowerCase().includes(search.toLowerCase()) ||
        row.data?.category?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "VALID" && row.status === "valid") ||
        (statusFilter === "DUPLICATE" && row.status === "duplicate") ||
        (statusFilter === "INVALID" && row.status === "invalid");

      return matchesSearch && matchesStatus;
    }) || [];

  // Calculate summary statistics
  const summary = parsedData?.summary || {
    total: 0,
    valid: 0,
    duplicate: 0,
    invalid: 0,
  };

  const finalResults = importResults || {
    total: 0,
    successful: 0,
    skipped: 0,
    failed: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={role === "admin" ? "/admin/products" : "/manager/products"}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowLeft size={14} />
            Back to Products
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Product Import Dashboard
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Upload and import products in bulk
            </p>
          </div>
        </div>

        {step !== "upload" && (
          <button
            type="button"
            onClick={handleReset}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={14} />
            Import Another File
          </button>
        )}
      </div>

      {/* Error Display */}
      {uploadError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Rows"
          value={step === "complete" ? finalResults.total : summary.total}
          description="Records in uploaded file"
          icon={FileText}
        />
        <StatCard
          title="Successfully Imported"
          value={finalResults.successful}
          description="Products saved to database"
          icon={CheckCircle2}
        />
        <StatCard
          title="Duplicates Skipped"
          value={step === "complete" ? finalResults.skipped : summary.duplicate}
          description="Already exist or repeated"
          icon={Database}
        />
        <StatCard
          title="Invalid / Failed"
          value={step === "complete" ? finalResults.failed : summary.invalid}
          description="Validation or insertion errors"
          icon={AlertTriangle}
        />
        <StatCard
          title="Pending"
          value={
            step === "complete" ? 0 : summary.valid - finalResults.successful
          }
          description="Rows not yet processed"
          icon={Package}
        />
      </div>

      {/* Progress Bar */}
      {step === "processing" && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Importing Products...
            </span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {importProgress}%
            </span>
          </div>
          <div className="h-2 bg-zinc-200 rounded-full overflow-hidden dark:bg-zinc-800">
            <div
              className="h-full bg-zinc-900 transition-all duration-300 dark:bg-zinc-100"
              style={{ width: `${importProgress}%` }}
            />
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            <LoaderCircle size={14} className="animate-spin" />
            <span>Processing {summary.valid} products...</span>
          </div>
        </div>
      )}

      {/* Upload Section */}
      {step === "upload" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              file
                ? "border-zinc-300 bg-zinc-50"
                : "border-zinc-300 hover:border-zinc-400"
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
              <div className="space-y-4">
                <FileSpreadsheet className="mx-auto h-16 w-16 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    Drag and drop your file here
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    or click to browse
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  <Upload size={16} />
                  Select File
                </button>
                <p className="text-xs text-zinc-400">
                  CSV, XLSX, or XLS · Max 5MB · Max 10,000 rows
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  <X size={14} />
                  Remove
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={downloadSampleTemplate}
              className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
            >
              <Download size={14} />
              Download Sample Template
            </button>

            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {uploading ? "Parsing..." : "Preview Import"}
            </button>
          </div>
        </div>
      )}

      {/* Preview Section */}
      {(step === "preview" || step === "processing" || step === "complete") && (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {/* Table Header */}
          <div className="p-4 border-b border-zinc-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Import Results
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search products..."
                    className="w-48 rounded-lg border border-zinc-200 bg-transparent pl-9 pr-3 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-transparent px-3 py-1.5 text-xs text-zinc-900 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="ALL">All Status</option>
                  <option value="VALID">Valid</option>
                  <option value="DUPLICATE">Duplicate</option>
                  <option value="INVALID">Invalid</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
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
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredRows.slice(0, 100).map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-zinc-600">{row.rowNumber}</td>
                    <td className="px-4 py-3 text-zinc-900 font-medium">
                      {row.data?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-zinc-900">
                      {row.data?.category || "-"}
                    </td>
                    <td className="px-4 py-3 text-zinc-900">
                      {row.data?.price
                        ? `₹${Number(row.data.price).toFixed(2)}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "valid" && (
                        <Badge variant="success">Valid</Badge>
                      )}
                      {row.status === "duplicate" && (
                        <Badge variant="warning">Duplicate</Badge>
                      )}
                      {row.status === "invalid" && (
                        <Badge variant="destructive">Invalid</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 max-w-xs truncate">
                      {row.errors?.join(", ") || row.duplicateReason || "-"}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-zinc-500"
                    >
                      No results match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredRows.length > 100 && (
            <div className="px-4 py-2 bg-zinc-50 border-t border-zinc-200 text-[11px] text-zinc-500">
              Showing first 100 of {filteredRows.length} rows
            </div>
          )}
        </div>
      )}

      {/* Import Actions */}
      {step === "preview" && (
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || summary.valid === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Package size={14} />
            Import {summary.valid} Products
          </button>
        </div>
      )}

      {/* Final Summary */}
      {step === "complete" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/40">
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300 mb-3">
              Import Complete
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-emerald-600 dark:text-emerald-400">
                  Total rows
                </p>
                <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
                  {finalResults.total}
                </p>
              </div>
              <div>
                <p className="text-emerald-600 dark:text-emerald-400">
                  Successfully imported
                </p>
                <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
                  {finalResults.successful}
                </p>
              </div>
              <div>
                <p className="text-amber-600 dark:text-amber-400">
                  Duplicates skipped
                </p>
                <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                  {finalResults.skipped}
                </p>
              </div>
              <div>
                <p className="text-rose-600 dark:text-rose-400">Failed</p>
                <p className="text-lg font-semibold text-rose-900 dark:text-rose-100">
                  {finalResults.failed}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {finalResults.errors.length > 0 && (
              <button
                type="button"
                onClick={() => downloadErrorReport(finalResults)}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Download size={14} />
                Download Error Report
              </button>
            )}

            <Link
              href={role === "admin" ? "/admin/products" : "/manager/products"}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Package size={14} />
              View Imported Products
            </Link>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <RefreshCw size={14} />
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
