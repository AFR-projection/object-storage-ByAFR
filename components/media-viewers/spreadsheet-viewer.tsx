"use client";

import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { usePreviewSource } from "@/hooks/use-preview-source";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, Table2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpreadsheetViewerProps {
  src: string;
  fileName: string;
  fileId: string;
}

const MAX_ROWS = 1000;
const MAX_COLS = 50;

export function SpreadsheetViewer({ src, fileName, fileId }: SpreadsheetViewerProps) {
  const { arrayBuffer, loading, error } = usePreviewSource(src);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!arrayBuffer) return;
    try {
      const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
      setWorkbook(wb);
      setActiveSheet(0);
      setParseError(null);
    } catch {
      setParseError("Format spreadsheet tidak didukung atau file rusak");
      setWorkbook(null);
    }
  }, [arrayBuffer]);

  const sheetName = workbook?.SheetNames[activeSheet] ?? "";
  const grid = useMemo(() => {
    if (!workbook || !sheetName) return { rows: [] as string[][], truncated: false };
    const ws = workbook.Sheets[sheetName];
    const raw: string[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as string[][];

    const truncated = raw.length > MAX_ROWS || raw.some((r) => r.length > MAX_COLS);
    const rows = raw.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS));
    return { rows, truncated };
  }, [workbook, sheetName]);

  const colCount = useMemo(
    () => Math.max(...grid.rows.map((r) => r.length), 0),
    [grid.rows]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-card">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <p className="text-xs text-muted-foreground">Memuat spreadsheet...</p>
        </div>
      </div>
    );
  }

  if (error || parseError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-card gap-3">
        <p className="text-sm">{error ?? parseError}</p>
        <Button variant="secondary" size="sm" onClick={() => window.open(`/api/download/${fileId}`)}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Download
        </Button>
      </div>
    );
  }

  if (!workbook || grid.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-card">
        <Table2 className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">Spreadsheet kosong</p>
      </div>
    );
  }

  const headers = grid.rows[0] ?? [];

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Table2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{fileName}</span>
          {grid.truncated && (
            <span className="flex items-center gap-1 text-[10px] text-amber-500 shrink-0">
              <AlertTriangle className="h-3 w-3" /> dipotong
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => window.open(`/api/download/${fileId}`)}>
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>

      {workbook.SheetNames.length > 1 && (
        <div className="flex gap-1 px-3 py-1.5 border-b border-border/20 overflow-x-auto shrink-0">
          {workbook.SheetNames.map((name, i) => (
            <button
              key={name}
              onClick={() => setActiveSheet(i)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors",
                i === activeSheet
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs min-w-max">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
            <tr>
              <th className="w-10 px-2 py-2 text-left text-muted-foreground/50 font-normal border-b border-border/30">#</th>
              {Array.from({ length: colCount }).map((_, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium border-b border-border/30 whitespace-nowrap max-w-[220px] truncate"
                >
                  {headers[i] || XLSX.utils.encode_col(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.slice(1).map((row, ri) => (
              <tr key={ri} className={cn("hover:bg-accent/5", ri % 2 === 0 && "bg-muted/10")}>
                <td className="px-2 py-1.5 text-muted-foreground/40 font-mono border-b border-border/10">{ri + 1}</td>
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5 border-b border-border/10 whitespace-nowrap max-w-[240px] truncate"
                    title={String(row[ci] ?? "")}
                  >
                    {String(row[ci] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
