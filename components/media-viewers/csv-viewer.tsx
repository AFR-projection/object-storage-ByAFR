"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, AlertTriangle, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CsvViewerProps {
  src: string;
  fileName: string;
}

const MAX_ROWS = 500;
const MAX_BYTES = 2_000_000;

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (ch === "\r") i++;
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function CsvViewer({ src, fileName }: CsvViewerProps) {
  const [rows, setRows] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [totalRows, setTotalRows] = useState(0);

  const delimiter = fileName.endsWith(".tsv") ? "\t" : ",";

  useEffect(() => {
    let cancelled = false;
    fetch(src, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        const slice = text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
        const parsed = parseDelimited(slice, delimiter);
        setTotalRows(parsed.length);
        setTruncated(text.length > MAX_BYTES || parsed.length > MAX_ROWS);
        setRows(parsed.slice(0, MAX_ROWS));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Gagal memuat spreadsheet");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [src, delimiter]);

  const colCount = useMemo(() => Math.max(...rows.map((r) => r.length), 0), [rows]);
  const headers = rows[0] ?? [];

  async function handleCopy() {
    const tsv = rows.map((r) => r.join("\t")).join("\n");
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-card">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <p className="text-xs text-muted-foreground">Memuat tabel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Table2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>{totalRows} baris · {colCount} kolom</span>
          {truncated && (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="h-3 w-3" />
              dipotong
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="w-10 px-2 py-2 text-left text-muted-foreground/50 font-normal border-b border-border/30">#</th>
              {Array.from({ length: colCount }).map((_, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium text-foreground/80 border-b border-border/30 whitespace-nowrap max-w-[200px] truncate"
                >
                  {headers[i] || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, ri) => (
              <tr key={ri} className={cn("hover:bg-accent/5 transition-colors", ri % 2 === 0 && "bg-muted/10")}>
                <td className="px-2 py-1.5 text-muted-foreground/40 font-mono border-b border-border/10">{ri + 1}</td>
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5 border-b border-border/10 whitespace-nowrap max-w-[240px] truncate"
                    title={row[ci] ?? ""}
                  >
                    {row[ci] ?? ""}
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
