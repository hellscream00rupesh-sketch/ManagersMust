const ExcelJS = require("exceljs");
const JSZip = require("jszip");

function cellToString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if (value.text !== undefined) {
      return String(value.text);
    }
    if (value.result !== undefined) {
      return cellToString(value.result);
    }
    return "";
  }
  return String(value);
}

function cellToNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "object" && value.result !== undefined) {
    return cellToNumber(value.result);
  }
  const parsed = Number(String(cellToString(value)).replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEmployeeId(raw) {
  return String(raw || "").trim().toUpperCase();
}

function extractStoreCode(locationName) {
  const match = String(locationName || "").trim().match(/^(\d+)\s*:/);
  return match ? match[1] : String(locationName || "").trim();
}

function toIsoDate(raw) {
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  const text = cellToString(raw).trim();
  // Formats: MM/DD/YYYY HH:mm:ss or ISO
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

// ---------- workbook loading (exceljs with raw-XML fallback) ----------

function decodeXmlEntities(text) {
  return String(text)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

function columnLettersToIndex(letters) {
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * Minimal OpenXML worksheet parser for files that exceljs cannot read
 * (e.g. BI exports that use namespace-prefixed elements and inline strings).
 * Returns a map of sheetName -> rows (arrays of primitive cell values).
 */
async function parseWorkbookRowsRaw(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const readEntry = async (name) => {
    const entry = zip.files[name];
    if (!entry) {
      return null;
    }
    const text = await entry.async("string");
    return text.replace(/^\uFEFF/, "");
  };

  // Shared strings (optional).
  let sharedStrings = [];
  const sharedXml = await readEntry("xl/sharedStrings.xml");
  if (sharedXml) {
    sharedStrings = [...sharedXml.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((match) =>
      [...match[1].matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)]
        .map((t) => decodeXmlEntities(t[1]))
        .join("")
    );
  }

  // Map sheet names to worksheet files via workbook.xml + its rels.
  const workbookXml = (await readEntry("xl/workbook.xml")) || "";
  const relsXml = (await readEntry("xl/_rels/workbook.xml.rels")) || "";
  const relTargets = {};
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const idMatch = match[0].match(/\bId="([^"]+)"/);
    const targetMatch = match[0].match(/\bTarget="([^"]+)"/);
    if (idMatch && targetMatch) {
      let target = targetMatch[1].replace(/^\//, "");
      if (!target.startsWith("xl/")) {
        target = `xl/${target}`;
      }
      relTargets[idMatch[1]] = target;
    }
  }

  const sheets = [];
  for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const nameMatch = match[0].match(/\bname="([^"]+)"/);
    const ridMatch = match[0].match(/\br:id="([^"]+)"/) || match[0].match(/\bid="([^"]+)"/);
    if (nameMatch) {
      sheets.push({
        name: decodeXmlEntities(nameMatch[1]),
        file: ridMatch ? relTargets[ridMatch[1]] : null
      });
    }
  }

  const worksheetFiles = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name))
    .sort();

  const result = {};
  for (let index = 0; index < Math.max(sheets.length, worksheetFiles.length); index += 1) {
    const sheet = sheets[index] || {};
    const file = sheet.file && zip.files[sheet.file] ? sheet.file : worksheetFiles[index];
    if (!file) {
      continue;
    }
    const xml = await readEntry(file);
    if (!xml) {
      continue;
    }

    const rows = [];
    for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(
        /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g
      )) {
        const attrs = cellMatch[1] || "";
        const inner = cellMatch[2] || "";

        const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
        const columnIndex = refMatch ? columnLettersToIndex(refMatch[1]) : cells.length;

        const typeMatch = attrs.match(/\bt="(\w+)"/);
        const type = typeMatch ? typeMatch[1] : null;

        let value = null;
        if (type === "inlineStr") {
          const texts = [...inner.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)];
          value = decodeXmlEntities(texts.map((t) => t[1]).join(""));
        } else {
          const valueMatch = inner.match(/<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/);
          if (valueMatch) {
            const raw = decodeXmlEntities(valueMatch[1]);
            if (type === "s") {
              value = sharedStrings[Number(raw)] ?? null;
            } else if (type === "str") {
              value = raw;
            } else if (type === "b") {
              value = raw === "1";
            } else {
              const numeric = Number(raw);
              value = Number.isFinite(numeric) ? numeric : raw;
            }
          }
        }

        cells[columnIndex] = value === "" ? null : value;
      }
      rows.push(cells);
    }

    result[sheet.name || file] = rows;
  }

  return result;
}

/**
 * Returns rows (arrays of raw cell values, 0-indexed columns) for the first
 * matching sheet, using exceljs first and falling back to the raw OpenXML parser.
 */
async function getSheetRows(buffer, preferredSheets) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    let worksheet = null;
    for (const name of preferredSheets) {
      worksheet = workbook.getWorksheet(name);
      if (worksheet) {
        break;
      }
    }
    if (!worksheet) {
      worksheet = workbook.worksheets[0];
    }
    if (!worksheet) {
      throw new Error("Workbook has no worksheets.");
    }

    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      rows[rowNumber - 1] = row.values.slice(1);
    });
    return rows.map((row) => row || []);
  } catch {
    const sheetMap = await parseWorkbookRowsRaw(buffer);
    const names = Object.keys(sheetMap);
    if (names.length === 0) {
      throw new Error("Could not read any worksheet from this file.");
    }
    for (const name of preferredSheets) {
      if (sheetMap[name]) {
        return sheetMap[name];
      }
    }
    return sheetMap[names[0]];
  }
}

function buildHeaderIndex(rowArray) {
  const index = {};
  (rowArray || []).forEach((value, columnIndex) => {
    const key = cellToString(value).trim();
    if (key && index[key] === undefined) {
      index[key] = columnIndex;
    }
  });
  return index;
}

// ---------- sales report ----------

const ACT_PRODUCT_TYPES = new Set(["NEWACTIVATION", "ADDALINE"]);
const UPG_PRODUCT_TYPES = new Set(["UPGRADE"]);
const HI_PRODUCT_PATTERN = /cricket\s+gateway/i;

async function parseSalesReport(buffer) {
  const rows = await getSheetRows(buffer, ["Report_Output"]);

  // Find the header row (contains "Receipt #").
  let headerRowIndex = -1;
  let headers = null;
  for (let index = 0; index < Math.min(10, rows.length); index += 1) {
    const candidate = buildHeaderIndex(rows[index]);
    if (candidate["Receipt #"] !== undefined && candidate["Product Type"] !== undefined) {
      headerRowIndex = index;
      headers = candidate;
      break;
    }
  }

  if (!headers) {
    throw new Error("This file does not look like a Sales By Product report (no header row found).");
  }

  const required = [
    "Created By ATTUID",
    "Created By Username",
    "Date Created",
    "Location Name",
    "Product Name",
    "Product Type",
    "Refund",
    "Quantity",
    "Net Sales"
  ];
  const missing = required.filter((key) => headers[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Sales report is missing expected columns: ${missing.join(", ")}`);
  }

  const employees = {};
  const monthCounts = {};
  let rowCount = 0;

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.length === 0) {
      continue;
    }

    const employeeId = normalizeEmployeeId(cellToString(row[headers["Created By ATTUID"]]));
    if (!employeeId) {
      continue;
    }

    const date = toIsoDate(row[headers["Date Created"]]);
    if (!date) {
      continue;
    }

    const productType = cellToString(row[headers["Product Type"]]).trim().toUpperCase();
    const productName = cellToString(row[headers["Product Name"]]).trim();
    const isRefund = cellToString(row[headers["Refund"]]).trim().toLowerCase() === "yes";
    const quantity = Math.abs(cellToNumber(row[headers["Quantity"]])) || 1;
    const netSales = cellToNumber(row[headers["Net Sales"]]);
    const storeCode = extractStoreCode(cellToString(row[headers["Location Name"]]));
    const name = cellToString(row[headers["Created By Username"]]).trim();

    rowCount += 1;
    monthCounts[date.slice(0, 7)] = (monthCounts[date.slice(0, 7)] || 0) + 1;

    if (!employees[employeeId]) {
      employees[employeeId] = {
        employeeId,
        name: name || employeeId,
        days: {},
        accessoryRevenue: 0,
        hiQty: 0,
        boxes: 0
      };
    }
    const employee = employees[employeeId];
    if (name && employee.name === employee.employeeId) {
      employee.name = name;
    }

    const sign = isRefund ? -1 : 1;

    if (productType === "ACCESSORY") {
      // Refund rows may already carry a negative net sales value.
      const amount = isRefund ? -Math.abs(netSales) : netSales;
      employee.accessoryRevenue += amount;
      continue;
    }

    const isHiDevice = productType === "DEVICE" && HI_PRODUCT_PATTERN.test(productName);
    const isAct = ACT_PRODUCT_TYPES.has(productType);
    const isUpg = UPG_PRODUCT_TYPES.has(productType);

    if (!isAct && !isUpg && !isHiDevice) {
      continue;
    }

    if (!employee.days[date]) {
      employee.days[date] = {};
    }
    if (!employee.days[date][storeCode]) {
      employee.days[date][storeCode] = { act: 0, chi: 0, upg: 0 };
    }
    const bucket = employee.days[date][storeCode];

    if (isAct) {
      bucket.act += sign * quantity;
      employee.boxes += sign * quantity;
    } else if (isUpg) {
      bucket.upg += sign * quantity;
      employee.boxes += sign * quantity;
    } else if (isHiDevice) {
      bucket.chi += sign * quantity;
      employee.hiQty += sign * quantity;
    }
  }

  Object.values(employees).forEach((employee) => {
    employee.accessoryRevenue = Math.round(employee.accessoryRevenue * 100) / 100;
  });

  const month = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return { month, rowCount, employees };
}

// ---------- metrics report ----------

const METRIC_COLUMNS = {
  totalConnectedGrossAdds: "Total Connected Gross Adds",
  wirelessGrossAdds: "Wireless Gross Adds",
  homeInternetOrders: "Home Internet Orders",
  homeInternetGrossAdds: "Home Internet Gross Adds",
  deviceUpgrades: "Device Upgrades",
  addALinePct: "Add-a-Line Activations %",
  autopayRate: "Autopay Enrollment Rate",
  protectRate: "Protect Attach Rate (All-In)",
  accessoryRevenue: "Accessory Revenue",
  accessoryRevenuePerOpp: "Accessory Revenue per Opportunity"
};

async function parseMetricsReport(buffer) {
  const rows = await getSheetRows(buffer, ["Export"]);
  if (rows.length === 0) {
    throw new Error("The metrics file is empty.");
  }

  const headers = buildHeaderIndex(rows[0]);
  if (headers["Advocate Name and ID"] === undefined) {
    throw new Error("This file does not look like an advocate metrics export (missing 'Advocate Name and ID').");
  }

  const missing = Object.values(METRIC_COLUMNS).filter((key) => headers[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Metrics file is missing expected columns: ${missing.join(", ")}`);
  }

  const advocates = {};
  let rowCount = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.length === 0) {
      continue;
    }

    const label = cellToString(row[headers["Advocate Name and ID"]]).trim();
    if (!label || /^total$/i.test(label) || /^applied filters/i.test(label)) {
      continue;
    }

    const separatorIndex = label.lastIndexOf(" - ");
    if (separatorIndex === -1) {
      continue;
    }

    const name = label.slice(0, separatorIndex).trim();
    const employeeId = normalizeEmployeeId(label.slice(separatorIndex + 3));
    if (!employeeId) {
      continue;
    }

    const metrics = {};
    Object.entries(METRIC_COLUMNS).forEach(([key, column]) => {
      const raw = row[headers[column]];
      metrics[key] = raw === null || raw === undefined || raw === "" ? null : cellToNumber(raw);
    });

    rowCount += 1;
    advocates[employeeId] = { employeeId, name, ...metrics };
  }

  return { rowCount, advocates };
}

module.exports = { parseSalesReport, parseMetricsReport, normalizeEmployeeId };
