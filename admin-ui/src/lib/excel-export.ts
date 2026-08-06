import type ExcelJS from 'exceljs';

export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export interface ExcelExportColumn<Row> {
  key: string;
  header: string;
  value: (row: Row, index: number) => ExcelCellValue;
  width?: number;
  format?: 'text' | 'integer' | 'decimal' | 'currency' | 'date' | 'datetime';
  alignment?: 'left' | 'center' | 'right';
}

export interface ExcelExportOptions<Row> {
  filename: string;
  sheetName: string;
  title: string;
  subtitle?: string;
  rows: Row[];
  columns: ExcelExportColumn<Row>[];
}

const COLORS = {
  navy: 'FF16324F',
  blue: 'FF2563A6',
  paleBlue: 'FFEAF2F8',
  paleGray: 'FFF6F8FA',
  border: 'FFD8E1E8',
  text: 'FF243442',
  muted: 'FF607385',
  white: 'FFFFFFFF',
};

function safeSheetName(name: string) {
  return (
    name
      .replace(/[\\/*?:[\]]/g, ' ')
      .trim()
      .slice(0, 31) || '数据'
  );
}

function safeFilename(filename: string) {
  const normalized = filename.replace(/[\\/:*?"<>|]/g, '-').trim() || '数据导出';
  return normalized.toLowerCase().endsWith('.xlsx') ? normalized : `${normalized}.xlsx`;
}

function formatExportTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function numberFormat(format: ExcelExportColumn<unknown>['format']) {
  if (format === 'integer') return '0';
  if (format === 'decimal') return '0.00';
  if (format === 'currency') return '¥#,##0.00;[Red]-¥#,##0.00';
  if (format === 'date') return 'yyyy"年"m"月"d"日"';
  if (format === 'datetime') return 'yyyy"年"m"月"d"日" hh:mm';
  if (format === 'text') return '@';
  return undefined;
}

function triggerDownload(buffer: ExcelJS.Buffer, filename: string) {
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportStyledExcel<Row>(options: ExcelExportOptions<Row>) {
  if (options.columns.length === 0) {
    throw new Error('导出列不能为空');
  }

  const exportedAt = new Date();
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '灵构教育管理后台';
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  workbook.company = 'Lingcoo';
  workbook.subject = options.title;

  const worksheet = workbook.addWorksheet(safeSheetName(options.sheetName), {
    properties: { defaultRowHeight: 22 },
    pageSetup: {
      orientation: options.columns.length > 8 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: {
      oddFooter: '&L灵构教育管理后台&C第 &P / &N 页&R数据导出',
    },
  });

  const lastColumn = options.columns.length;
  worksheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = options.title;
  titleCell.font = { name: 'Microsoft YaHei', size: 18, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 38;

  worksheet.mergeCells(2, 1, 2, lastColumn);
  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = options.subtitle?.trim() || '管理后台业务数据';
  subtitleCell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: COLORS.muted } };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paleBlue } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(2).height = 25;

  worksheet.mergeCells(3, 1, 3, lastColumn);
  const metadataCell = worksheet.getCell(3, 1);
  metadataCell.value = `导出时间：${formatExportTime(exportedAt)}    共 ${options.rows.length} 条记录`;
  metadataCell.font = { name: 'Microsoft YaHei', size: 9, color: { argb: COLORS.muted } };
  metadataCell.alignment = { vertical: 'middle', horizontal: 'right' };
  worksheet.getRow(3).height = 22;

  const headerRowNumber = 5;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.values = options.columns.map((column) => column.header);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.border } },
      left: { style: 'thin', color: { argb: COLORS.border } },
      bottom: { style: 'thin', color: { argb: COLORS.border } },
      right: { style: 'thin', color: { argb: COLORS.border } },
    };
  });

  options.columns.forEach((column, index) => {
    const worksheetColumn = worksheet.getColumn(index + 1);
    worksheetColumn.width = Math.min(Math.max(column.width ?? 14, 8), 50);
    worksheetColumn.numFmt = numberFormat(column.format) ?? 'General';
  });

  options.rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.addRow(options.columns.map((column) => column.value(row, rowIndex)));
    excelRow.height = 27;
    excelRow.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
      const column = options.columns[columnIndex - 1];
      cell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: COLORS.text } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowIndex % 2 === 0 ? COLORS.white : COLORS.paleGray },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: column.alignment ?? (typeof cell.value === 'number' ? 'right' : 'left'),
        wrapText: true,
      };
      cell.border = {
        bottom: { style: 'hair', color: { argb: COLORS.border } },
        right: { style: 'hair', color: { argb: COLORS.border } },
      };
      const cellNumberFormat = numberFormat(column.format);
      if (cellNumberFormat) cell.numFmt = cellNumberFormat;
    });
  });

  const lastRow = Math.max(headerRowNumber, worksheet.rowCount);
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: lastRow, column: lastColumn },
  };
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber, activeCell: 'A6' }];
  worksheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
  worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(lastColumn).letter}${lastRow}`;

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, options.filename);
}
