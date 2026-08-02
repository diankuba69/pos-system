"use client";

import { Input } from "@/components/ui/field";
import { Empty, SkeletonRows } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  align?: "left" | "right";
  className?: string;
  width?: string;
};

export function DataTable<T>({
  rows,
  columns,
  keyOf,
  loading,
  search,
  searchText,
  searchPlaceholder = "Cari...",
  pageSize = 12,
  emptyText = "Belum ada data.",
  emptyHint,
  emptyAction,
  onRowClick,
  rowTestId,
  toolbar,
  footer,
  testId,
}: {
  rows: T[];
  columns: Column<T>[];
  keyOf: (row: T) => string;
  loading?: boolean;
  search?: boolean;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyText?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  rowTestId?: (row: T) => string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || !searchText) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(term));
  }, [rows, q, searchText]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = col.sort!(a);
      const vb = col.sort!(b);
      if (typeof va === "number" && typeof vb === "number") return asc ? va - vb : vb - va;
      return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [filtered, sortKey, asc, columns]);

  const pages = Math.max(Math.ceil(sorted.length / pageSize), 1);
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <div className="card overflow-hidden" data-testid={testId}>
      {(search || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          {search ? (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
              <Input
                data-testid={testId ? `${testId}-search` : "table-search"}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-10 pl-9"
              />
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">{toolbar}</div>
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={6} cols={columns.length} />
      ) : visible.length === 0 ? (
        <Empty text={q ? `Tidak ada hasil untuk "${q}"` : emptyText} hint={emptyHint} action={emptyAction} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b border-line text-left">
                {columns.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      style={c.width ? { width: c.width } : undefined}
                      className={cn(
                        "px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-dim",
                        c.align === "right" && "text-right",
                      )}
                    >
                      {c.sort ? (
                        <button
                          data-testid={`sort-${c.key}`}
                          onClick={() => {
                            if (active) setAsc((v) => !v);
                            else {
                              setSortKey(c.key);
                              setAsc(true);
                            }
                          }}
                          className={cn(
                            "inline-flex items-center gap-1 transition-colors duration-150 hover:text-ink",
                            active && "text-ink",
                            c.align === "right" && "flex-row-reverse",
                          )}
                        >
                          {c.header}
                          {active ? (
                            asc ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowDown className="h-3 w-3 opacity-25" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr
                  key={keyOf(row)}
                  data-testid={rowTestId?.(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
                  className={cn(
                    "anim-up border-b border-line/70 transition-colors duration-150 last:border-0 hover:bg-muted/60",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn("px-5 py-3 align-middle", c.align === "right" && "text-right", c.className)}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer && <tfoot className="border-t border-line bg-muted/50 font-semibold">{footer}</tfoot>}
          </table>
        </div>
      )}

      {!loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-dim">
          <span className="tabular-nums">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)} dari {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              data-testid="table-prev"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              className="rounded-lg border border-line p-1.5 transition-colors duration-150 hover:text-ink disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-semibold tabular-nums text-ink">
              {current + 1}/{pages}
            </span>
            <button
              data-testid="table-next"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
              className="rounded-lg border border-line p-1.5 transition-colors duration-150 hover:text-ink disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
