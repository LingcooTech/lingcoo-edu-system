import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { isValidElement, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type SortDirection = 'asc' | 'desc';
type SortValue = string | number | boolean | Date | null | undefined;

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  sortValue?: (row: T) => SortValue;
  filterValue?: (row: T) => SortValue;
  mobileHidden?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  emptyMessage = '暂无数据',
  getRowKey,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 20, 50],
  searchable,
}: {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  getRowKey?: (row: T, index: number) => string | number;
  pageSize?: number;
  pageSizeOptions?: number[];
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [sortState, setSortState] = useState<{ key: string; direction: SortDirection } | null>(
    null,
  );
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const searchEnabled = searchable ?? data.length > 6;

  const filteredData = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data;
    return data.filter((row) =>
      columns.some((column) => columnFilterText(column, row).toLowerCase().includes(normalized)),
    );
  }, [columns, data, query]);

  const sortedData = useMemo(() => {
    if (!sortState) return filteredData;
    const column = columns.find((item) => item.key === sortState.key);
    if (!column) return filteredData;
    return filteredData.slice().sort((left, right) => {
      const result = compareSortValue(
        columnSortValue(column, left),
        columnSortValue(column, right),
      );
      return sortState.direction === 'asc' ? result : -result;
    });
  }, [columns, filteredData, sortState]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = paginationItems(currentPage, totalPages);
  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedData]);
  const showTopControls = searchEnabled;
  const showFooter = searchEnabled || totalPages > 1;
  const firstItem = sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, sortedData.length);

  function toggleSort(column: Column<T>) {
    if (column.sortable === false) return;
    setPage(1);
    setSortState((current) => {
      if (!current || current.key !== column.key) {
        return { key: column.key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key: column.key, direction: 'desc' };
      }
      return null;
    });
  }

  function rowKey(row: T, index: number) {
    return getRowKey?.(row, index) ?? index;
  }

  return (
    <div className="resource-card data-table-card">
      {showTopControls ? (
        <div className="table-control-bar">
          <div className="text-muted-foreground text-sm">
            {query ? `筛选 ${sortedData.length} / ${data.length} 条` : `共 ${data.length} 条`}
          </div>
          {searchEnabled ? (
            <label className="table-search">
              <Search className="text-muted-foreground h-4 w-4" />
              <input
                className="placeholder:text-muted-foreground/65 min-w-0 flex-1 bg-transparent outline-none"
                placeholder="搜索表格内容"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          ) : (
            <span />
          )}
        </div>
      ) : null}

      <div className="table-scroll hidden md:block">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sortState?.key === column.key;
                const sortable = column.sortable !== false;
                return (
                  <th
                    key={column.key}
                    className={column.className}
                    aria-sort={
                      active
                        ? sortState.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="hover:text-foreground inline-flex h-6 items-center gap-1.5 rounded-sm"
                        onClick={() => toggleSort(column)}
                      >
                        {column.header}
                        {active ? (
                          sortState.direction === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedData.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground py-12 text-center text-sm"
                  colSpan={columns.length}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedData.map((row, rowIndex) => (
                <tr key={rowKey(row, rowIndex)} className="data-row">
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-table-list">
        {pagedData.length === 0 ? (
          <div className="text-muted-foreground px-4 py-12 text-center text-sm">{emptyMessage}</div>
        ) : (
          pagedData.map((row, rowIndex) => (
            <article key={rowKey(row, rowIndex)} className="bg-card space-y-3 p-4">
              {columns
                .filter((column) => !column.mobileHidden)
                .map((column) => (
                  <div key={column.key} className="grid gap-1">
                    <div className="text-muted-foreground text-[11px] font-semibold uppercase">
                      {column.header}
                    </div>
                    <div className="min-w-0 text-sm">{column.cell(row)}</div>
                  </div>
                ))}
            </article>
          ))
        )}
      </div>

      {showFooter ? (
        <div className="table-footer">
          <span className="text-foreground font-medium whitespace-nowrap">
            共 {sortedData.length} 条{totalPages > 1 ? `，${firstItem}-${lastItem}` : ''}
          </span>
          <div className="table-pagination" aria-label="分页">
            {totalPages > 1 ? (
              <>
                <button
                  type="button"
                  className="pagination-button"
                  aria-label="上一页"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={`pagination-button ${item === currentPage ? 'pagination-active' : ''}`}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="pagination-button"
                  aria-label="下一页"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            每页
            <select
              className="table-page-size"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function paginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const items: Array<number | 'ellipsis'> = [];
  let previous = 0;

  Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right)
    .forEach((page) => {
      if (previous && page - previous > 1) {
        items.push('ellipsis');
      }
      items.push(page);
      previous = page;
    });

  return items;
}

function columnFilterText<T>(column: Column<T>, row: T) {
  const value = column.filterValue?.(row);
  return value === undefined ? nodeText(column.cell(row)) : valueText(value);
}

function columnSortValue<T>(column: Column<T>, row: T) {
  const value = column.sortValue?.(row);
  return value === undefined ? nodeText(column.cell(row)) : value;
}

function valueText(value: SortValue) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return String(value.getTime());
  return String(value);
}

function compareSortValue(left: SortValue | string, right: SortValue | string) {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return leftValue - rightValue;
  }
  if (typeof leftValue === 'boolean' && typeof rightValue === 'boolean') {
    return Number(leftValue) - Number(rightValue);
  }

  return valueText(leftValue).localeCompare(valueText(rightValue), 'zh-Hans-CN', {
    numeric: true,
    sensitivity: 'base',
  });
}

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeText).join(' ');
  }
  if (isValidElement<{ children?: ReactNode; label?: ReactNode; title?: ReactNode }>(node)) {
    const { children, label, title } = node.props;
    return [children, label, title].map(nodeText).filter(Boolean).join(' ');
  }
  return '';
}
