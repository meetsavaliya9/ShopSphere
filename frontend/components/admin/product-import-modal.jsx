"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Download,
  X,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { authRequest } from "../../lib/api/auth";
import { useAuth } from "../auth-provider";
import { Modal } from "./modal";

const PRODUCT_FIELDS = [
  { value: "name", label: "Product Name", required: true },
  { value: "category", label: "Category", required: true },
  { value: "price", label: "Price", required: true },
  { value: "description", label: "Description", required: false },
  { value: "imageUrl", label: "Image URL", required: false },
  { value: "imagePublicId", label: "Image Public ID", required: false },
  { value: "stockQuantity", label: "Stock Quantity", required: false },
  { value: "lowStockThreshold", label: "Low Stock Threshold", required: false },
];

function downloadSampleTemplate() {
  const headers = PRODUCT_FIELDS.map((f) => f.label);
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

export function ProductImportModal({
  isOpen,
  onClose,
  role = "admin",
  onSuccess,
}) {
  const { csrfToken } = useAuth();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState("upload"); // upload, preview, results
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [parsedData, setParsedData] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [validating, setValidating] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

  const resetState = useCallback(() => {
    setFile(null);
    setUploadError("");
    setParsedData(null);
    setPreviewData(null);
    setImportResults(null);
    setStep("upload");
  }, []);

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
          ? "admin/products/import/preview"
          : "manager/products/import/preview";

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

      // The backend already validates and maps headers
      // Skip the mapping step since backend handles it
      setStep("preview");
    } catch (error) {
      setUploadError(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleMappingChange = (uploadHeader, targetField) => {
    setColumnMappings((prev) => ({
      ...prev,
      [uploadHeader]: targetField,
    }));

    // Re-validate mappings
    const newMappings = { ...columnMappings, [uploadHeader]: targetField };
    const errors = [];
    const mappedFields = new Set(
      Object.values(newMappings).filter((m) => m !== "ignore"),
    );

    const requiredFields = PRODUCT_FIELDS.filter((f) => f.required);
    for (const field of requiredFields) {
      if (!mappedFields.has(field.value)) {
        errors.push(`Required field "${field.label}" is not mapped`);
      }
    }

    setMappingErrors(errors);
  };

  const handlePreview = async () => {
    setValidating(true);

    try {
      // The backend already validated and mapped the data
      // We just need to extract the valid rows with their row numbers
      const transformedRows = parsedData.rowResults
        .filter((row) => row.status === "valid" || row.status === "duplicate")
        .map((row) => {
          const transformed = { rowNumber: row.rowNumber };

          // Use the already-validated data from the backend
          if (row.data) {
            Object.assign(transformed, row.data);
          }

          return transformed;
        });

      setPreviewData({
        rows: transformedRows,
        summary: parsedData.summary,
      });
      setStep("preview");
    } catch (error) {
      console.error("Preview error:", error);
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!previewData) return;

    setImporting(true);

    try {
      const validRows = previewData.rows.filter((row) => {
        // Only import rows that have all required fields
        const requiredFields = PRODUCT_FIELDS.filter((f) => f.required);
        return requiredFields.every((f) => row[f.value]);
      });

      const endpoint =
        role === "admin"
          ? "admin/products/import"
          : "manager/products/import";

      const response = await authRequest(endpoint, {
        method: "POST",
        body: { products: validRows },
        csrfToken,
      });

      setImportResults(response.results);
      setStep("results");

      if (onSuccess) onSuccess();
    } catch (error) {
      setUploadError(error.message || "Failed to import products");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Products"
      description="Upload a CSV or Excel file to import products in bulk"
    >
      <div className="space-y-6">
        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
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
                <div className="space-y-3">
                  <FileSpreadsheet className="mx-auto h-12 w-12 text-zinc-400" />
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
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                  >
                    <Upload size={14} />
                    Select File
                  </button>
                  <p className="text-[11px] text-zinc-400">
                    CSV, XLSX, or XLS · Max 5MB · Max 10,000 rows
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
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

            {uploadError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={downloadSampleTemplate}
                className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
              >
                <Download size={14} />
                Download Sample Template
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {uploading ? "Parsing..." : "Preview Import"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && previewData && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">
                Import Preview
              </h3>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] text-zinc-500">Total Rows</p>
                  <p className="text-lg font-semibold text-zinc-900">
                    {previewData.summary?.total || 0}
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-[11px] text-emerald-600">Valid</p>
                  <p className="text-lg font-semibold text-emerald-900">
                    {previewData.summary?.valid || 0}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[11px] text-amber-600">Duplicates</p>
                  <p className="text-lg font-semibold text-amber-900">
                    {previewData.summary?.duplicate || 0}
                  </p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <p className="text-[11px] text-rose-600">Invalid</p>
                  <p className="text-lg font-semibold text-rose-900">
                    {previewData.summary?.invalid || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-zinc-600">
                        Row
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600">
                        Name
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600">
                        Category
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600">
                        Price
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {previewData.rows.slice(0, 50).map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-zinc-600">
                          {row.rowNumber}
                        </td>
                        <td className="px-3 py-2 text-zinc-900">
                          {row.name || "-"}
                        </td>
                        <td className="px-3 py-2 text-zinc-900">
                          {row.category || "-"}
                        </td>
                        <td className="px-3 py-2 text-zinc-900">
                          {row.price ? `₹${Number(row.price).toFixed(2)}` : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                            Ready
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.rows.length > 50 && (
                <div className="px-3 py-2 bg-zinc-50 border-t border-zinc-200 text-[11px] text-zinc-500">
                  Showing first 50 of {previewData.rows.length} rows
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {importing ? "Importing..." : "Import Products"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === "results" && importResults && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">
                Import Complete
              </h3>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] text-zinc-500">Total</p>
                  <p className="text-lg font-semibold text-zinc-900">
                    {importResults.total}
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-[11px] text-emerald-600">Imported</p>
                  <p className="text-lg font-semibold text-emerald-900">
                    {importResults.successful}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[11px] text-amber-600">Skipped</p>
                  <p className="text-lg font-semibold text-amber-900">
                    {importResults.skipped}
                  </p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <p className="text-[11px] text-rose-600">Failed</p>
                  <p className="text-lg font-semibold text-rose-900">
                    {importResults.failed}
                  </p>
                </div>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <h4 className="text-xs font-semibold text-rose-900 mb-2">
                  Errors ({importResults.errors.length})
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {importResults.errors.map((error, idx) => (
                    <div key={idx} className="text-[11px] text-rose-800">
                      Row {error.row}: {error.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
