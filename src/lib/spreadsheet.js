import ExcelJS from "exceljs";

const MAX_ROWS = 20_000;
const MAX_COLUMNS = 256;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  if (Object.hasOwn(value, "result")) return cellText(value.result);
  if (typeof value.text === "string") return value.text;
  return JSON.stringify(value);
}

function trimGrid(rows) {
  let lastRow = rows.length;
  while (lastRow && rows[lastRow - 1].every((cell) => cell === "")) lastRow -= 1;
  const sliced = rows.slice(0, lastRow);
  let width = 0;
  for (const row of sliced) {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (row[index] !== "") { width = Math.max(width, index + 1); break; }
    }
  }
  return sliced.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
}

function worksheetGrid(worksheet) {
  if (worksheet.rowCount > MAX_ROWS || worksheet.columnCount > MAX_COLUMNS) {
    throw new Error(`Worksheet exceeds the ${MAX_ROWS.toLocaleString()} row or ${MAX_COLUMNS} column limit`);
  }
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells = [];
    const width = Math.min(worksheet.columnCount, MAX_COLUMNS);
    for (let column = 1; column <= width; column += 1) cells.push(cellText(row.getCell(column).value));
    rows[rowNumber - 1] = cells;
  });
  return trimGrid(rows.map((row) => row || []));
}

export async function readXlsx(bytes) {
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) throw new Error("Workbook data is required");
  const byteLength = bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.byteLength;
  if (byteLength > MAX_FILE_BYTES) throw new Error("Workbook file is too large (maximum 50 MB)");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  if (!workbook.worksheets.length) throw new Error("Workbook contains no worksheets");
  return workbook.worksheets.map((worksheet) => ({ name: worksheet.name, rows: worksheetGrid(worksheet) }));
}

function delimitedToGrid(text, separator, label) {
  const source = String(text ?? "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index <= source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else if (char === undefined) throw new Error(`${label} has an unclosed quoted field`);
      else field += char;
      continue;
    }
    if (char === '"' && field === "") { quoted = true; continue; }
    if (char === separator) { row.push(field); field = ""; continue; }
    if (char === "\n" || char === undefined) {
      if (char === "\n" && field.endsWith("\r")) field = field.slice(0, -1);
      row.push(field); rows.push(row); row = []; field = ""; continue;
    }
    field += char;
  }
  const grid = trimGrid(rows);
  if (grid.length > MAX_ROWS || grid.some((item) => item.length > MAX_COLUMNS)) {
    throw new Error(`${label} exceeds the ${MAX_ROWS.toLocaleString()} row or ${MAX_COLUMNS} column limit`);
  }
  return grid;
}

export function csvToGrid(text) {
  return delimitedToGrid(text, ",", "CSV");
}

export function tsvToGrid(text) {
  return delimitedToGrid(text, "\t", "TSV");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tsvCell(value) {
  const text = String(value ?? "");
  return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function gridToCsv(rows) {
  return trimGrid(rows.map((row) => row.map(cellText))).map((row) => row.map(csvCell).join(",")).join("\n");
}

export function gridToTsv(rows) {
  return trimGrid(rows.map((row) => row.map(cellText))).map((row) => row.map(tsvCell).join("\t")).join("\n");
}

export function gridToObjects(rows, firstRowHeader = true) {
  const grid = trimGrid(rows.map((row) => row.map(cellText)));
  if (!grid.length) return [];
  const width = Math.max(...grid.map((row) => row.length), 0);
  const rawHeaders = firstRowHeader ? grid[0] : Array.from({ length: width }, (_, index) => `column_${index + 1}`);
  const used = new Set();
  const headers = Array.from({ length: width }, (_, index) => {
    const base = String(rawHeaders[index] || `column_${index + 1}`).trim() || `column_${index + 1}`;
    let header = base;
    let suffix = 2;
    while (used.has(header)) header = `${base}_${suffix++}`;
    used.add(header);
    return header;
  });
  return grid.slice(firstRowHeader ? 1 : 0).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export function objectsToGrid(value) {
  if (!Array.isArray(value)) throw new Error("JSON must be an array of objects or values");
  if (!value.length) return [];
  if (value.every((item) => item == null || typeof item !== "object" || Array.isArray(item))) {
    return [["value"], ...value.map((item) => [cellText(item)])];
  }
  if (!value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    throw new Error("JSON rows must have a consistent object shape");
  }
  const headers = [];
  const seen = new Set();
  for (const item of value) for (const key of Object.keys(item)) if (!seen.has(key)) { seen.add(key); headers.push(key); }
  return [headers, ...value.map((item) => headers.map((header) => cellText(item[header])))];
}

export async function writeXlsx(sheets) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DBX Toolbox";
  const usedNames = new Set();
  for (const [index, sheet] of sheets.entries()) {
    const rawName = String(sheet.name || `Sheet${index + 1}`).replace(/[\\/?*:[\]]/g, "_").slice(0, 31) || `Sheet${index + 1}`;
    let name = rawName;
    for (let suffix = 2; usedNames.has(name.toLocaleLowerCase()); suffix += 1) {
      const tail = `_${suffix}`;
      name = `${rawName.slice(0, 31 - tail.length)}${tail}`;
    }
    usedNames.add(name.toLocaleLowerCase());
    const worksheet = workbook.addWorksheet(name);
    const rows = trimGrid((sheet.rows || []).map((row) => row.map(cellText)));
    for (const row of rows) worksheet.addRow(row);
    if (rows.length) {
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      worksheet.getRow(1).font = { bold: true };
      const widths = Array.from({ length: Math.max(...rows.map((row) => row.length), 0) }, (_, column) => {
        const longest = Math.max(...rows.slice(0, 500).map((row) => String(row[column] ?? "").length), 8);
        return { width: Math.min(48, longest + 2) };
      });
      worksheet.columns = widths;
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export const spreadsheetLimits = { rows: MAX_ROWS, columns: MAX_COLUMNS, fileBytes: MAX_FILE_BYTES };
