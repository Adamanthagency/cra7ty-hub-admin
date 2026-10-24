'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align numeric columns. */
  align?: 'left' | 'right';
  /** Enables sorting on this column. */
  sort?: (a: T, b: T) => number;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Enables the checkbox column + bulk slot. */
  selectable?: boolean;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Rendered above the table when selection is non-empty. */
  bulkBar?: ReactNode;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  selectable = false,
  selected,
  onSelectionChange,
  bulkBar,
  onRowClick,
  emptyMessage = 'Nothing here yet.',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const selectedIds = selected ?? [];
  const allIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);
  const allSelected = rows.length > 0 && allIds.every((id) => selectedIds.includes(id));
  const someSelected = allIds.some((id) => selectedIds.includes(id));

  const toggleAll = () => {
    onSelectionChange?.(allSelected ? [] : allIds);
  };

  const toggleOne = (id: string) => {
    onSelectionChange?.(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const copy = [...rows];
    copy.sort(col.sort);
    return sortDir === 'asc' ? copy : copy.reverse();
  }, [rows, columns, sortKey, sortDir]);

  const onSort = (col: Column<T>) => {
    if (!col.sort) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  return (
    <div className="card-admin overflow-hidden">
      {bulkBar && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 border-b border-line bg-paper-12 px-4 py-2.5">
          <span className="font-mono text-xs text-paper-70">
            {selectedIds.length} selected
          </span>
          {bulkBar}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              {selectable && (
                <th scope="col" className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-[#e5391f]"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-2.5 font-normal',
                    col.align === 'right' && 'text-right'
                  )}
                >
                  {col.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col)}
                      className={cn(
                        'inline-flex items-center gap-1 uppercase tracking-[0.16em] hover:text-paper',
                        sortKey === col.key && 'text-paper'
                      )}
                    >
                      {col.header}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? (
                          <ArrowUp size={11} aria-hidden />
                        ) : (
                          <ArrowDown size={11} aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown size={11} aria-hidden className="opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-8 text-center font-mono text-xs text-paper-60"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const id = getRowId(row);
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-line/60 transition-colors last:border-0',
                      onRowClick && 'cursor-pointer',
                      'hover:bg-paper-12',
                      selectedIds.includes(id) && 'bg-paper-12'
                    )}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select row ${id}`}
                          checked={selectedIds.includes(id)}
                          onChange={() => toggleOne(id)}
                          className="h-3.5 w-3.5 cursor-pointer accent-[#e5391f]"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 align-middle',
                          col.align === 'right' && 'text-right'
                        )}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
