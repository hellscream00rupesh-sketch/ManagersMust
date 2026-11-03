const ExcelJS = require("exceljs");

const SUMMARY_HEADERS = [
  "Employee",
  "Total_Boxes_Sales",
  "Box Sales_Commission",
  "KPIs_Hit",
  "KPI_Bonus",
  "Accessory_Sales",
  "Accessory_Commission",
  "HI Qty",
  "HI Commission",
  "Employee_ID",
  "Adjustments",
  "Final_Commission"
];

const DAILY_HEADERS = [
  "Employee",
  "Date",
  "Store Worked",
  "Total ACT",
  "CHI",
  "Commissionable ACT",
  "ACT Goal",
  "ACT Rate",
  "ACT Commission",
  "UPG",
  "UPG Goal",
  "UPG Rate",
  "UPG Commission",
  "Total Daily Box Commission"
];

function summaryRow(result) {
  return [
    result.name,
    result.boxes,
    result.boxCommission,
    result.kpisHit,
    result.kpiBonus,
    result.accessoryRevenue,
    result.accessoryCommission,
    result.hiQty,
    result.hiCommission,
    result.employeeId,
    result.adjustment,
    result.total
  ];
}

function sanitizeSheetName(name) {
  const cleaned = String(name || "Advocate").replace(/[\\/*?:[\]]/g, " ").trim();
  return (cleaned || "Advocate").slice(0, 31);
}

async function buildCommissionWorkbook({ month, results }) {
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet("Summary");
  summary.addRow(SUMMARY_HEADERS);
  results.forEach((result) => summary.addRow(summaryRow(result)));
  summary.getRow(1).font = { bold: true };

  const adjustmentsSheet = workbook.addWorksheet("Refunds & Adjustments");
  const adjusted = results.filter((result) => Number(result.adjustment) !== 0);
  if (adjusted.length === 0) {
    adjustmentsSheet.addRow(["Status"]);
    adjustmentsSheet.addRow(["No applied refunds"]);
  } else {
    adjustmentsSheet.addRow(["Employee", "Employee_ID", "Adjustment", "Note"]);
    adjusted.forEach((result) =>
      adjustmentsSheet.addRow([result.name, result.employeeId, result.adjustment, result.adjustmentNote || ""])
    );
  }
  adjustmentsSheet.getRow(1).font = { bold: true };

  const usedNames = new Set(["summary", "refunds & adjustments"]);
  results.forEach((result) => {
    let sheetName = sanitizeSheetName(result.name);
    let attempt = 1;
    while (usedNames.has(sheetName.toLowerCase())) {
      attempt += 1;
      sheetName = sanitizeSheetName(`${result.name} ${attempt}`);
    }
    usedNames.add(sheetName.toLowerCase());

    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(SUMMARY_HEADERS);
    sheet.addRow(summaryRow(result));
    sheet.addRow([]);
    sheet.addRow(DAILY_HEADERS);
    result.dailyRows.forEach((daily) => {
      sheet.addRow([
        result.name,
        daily.date,
        daily.storeCode,
        daily.act,
        daily.chi,
        daily.commissionableAct,
        daily.actGoal,
        daily.actRate,
        daily.actCommission,
        daily.upg,
        daily.upgGoal,
        daily.upgRate,
        daily.upgCommission,
        daily.total
      ]);
    });
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(4).font = { bold: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, fileName: `AdvocateCommission_${month}.xlsx` };
}

module.exports = { buildCommissionWorkbook };
