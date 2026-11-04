const DEFAULT_KPI_THRESHOLDS = {
  gross_adds_pct: 60,
  autopay_pct: 35,
  protect_pct: 40,
  acc_per_opp: 35,
  add_a_line_pct: 30
};

const KPI_LABELS = {
  gross_adds_pct: "Gross Adds %",
  autopay_pct: "Autopay %",
  protect_pct: "Protect Attach %",
  acc_per_opp: "Acc Rev / Opp",
  add_a_line_pct: "Add-a-Line %"
};

const DEFAULT_SETTINGS = {
  actRateMet: 10,
  actRateUnmet: 5,
  upgRateMet: 4,
  upgRateUnmet: 2,
  accessoryPct: 0.08,
  hiRate: 20,
  defaultKpiRate: 15,
  kpiThresholds: DEFAULT_KPI_THRESHOLDS
};

const DEFAULT_STORE_CONFIG = { tier: "B", actGoal: 3, upgGoal: 2, kpiRate: 15 };

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/**
 * Computes commission for every advocate from the normalized datasets.
 *
 * @param {object} salesEmployees  map employeeId -> { name, days: {date: {store: {act, chi, upg}}}, accessoryRevenue, hiQty, boxes }
 * @param {object} metricsAdvocates map employeeId -> parsed metric values (nullable)
 * @param {object} settings merged commission settings
 * @param {object} storeConfigs map storeCode -> { tier, actGoal, upgGoal, kpiRate }
 * @param {object} advocateConfigs map employeeId -> { displayName, kpiRateOverride, isActive }
 * @param {object} adjustments map employeeId -> { amount, note }
 */
function computeCommission({ salesEmployees, metricsAdvocates, settings, storeConfigs, advocateConfigs, adjustments }) {
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const thresholds = { ...DEFAULT_KPI_THRESHOLDS, ...(merged.kpiThresholds || {}) };
  const sales = salesEmployees || {};
  const metrics = metricsAdvocates || {};
  const advocates = advocateConfigs || {};
  const adjustmentMap = adjustments || {};
  const stores = storeConfigs || {};

  const getStoreConfig = (storeCode) => stores[storeCode] || { ...DEFAULT_STORE_CONFIG, tier: "?" };

  const employeeIds = new Set();
  Object.keys(advocates).forEach((id) => {
    if (advocates[id].isActive) {
      employeeIds.add(id);
    }
  });
  // If no advocate roster has been configured yet, include everyone present in both files.
  if (Object.keys(advocates).length === 0) {
    Object.keys(sales).forEach((id) => {
      if (metrics[id]) {
        employeeIds.add(id);
      }
    });
  }

  const results = [];

  employeeIds.forEach((employeeId) => {
    const salesEntry = sales[employeeId];
    const metricEntry = metrics[employeeId] || null;
    const advocateConfig = advocates[employeeId] || null;

    const displayName =
      advocateConfig?.displayName || salesEntry?.name || metricEntry?.name || employeeId;

    if (!salesEntry && !metricEntry) {
      return;
    }

    // ---- Box commission (daily, per store worked) ----
    const dailyRows = [];
    const storeBoxCount = {};
    const storesUsed = new Set();
    let totalAct = 0;
    let totalChi = 0;
    let totalUpg = 0;
    let actCommission = 0;
    let upgCommission = 0;

    if (salesEntry) {
      const dates = Object.keys(salesEntry.days || {}).sort();
      dates.forEach((date) => {
        const storesForDay = salesEntry.days[date];
        Object.keys(storesForDay).sort().forEach((storeCode) => {
          const bucket = storesForDay[storeCode];
          const act = Number(bucket.act) || 0;
          const chi = Number(bucket.chi) || 0;
          const upg = Number(bucket.upg) || 0;
          if (act === 0 && chi === 0 && upg === 0) {
            return;
          }

          storesUsed.add(storeCode);
          storeBoxCount[storeCode] = (storeBoxCount[storeCode] || 0) + act + upg;

          const config = getStoreConfig(storeCode);
          const commissionableAct = Math.max(0, act - chi);
          const actGoalMet = commissionableAct >= config.actGoal;
          const actRate = commissionableAct > 0 ? (actGoalMet ? merged.actRateMet : merged.actRateUnmet) : 0;
          const dailyActCommission = commissionableAct * actRate;

          const upgGoalMet = upg >= config.upgGoal;
          const upgRate = upg > 0 ? (upgGoalMet ? merged.upgRateMet : merged.upgRateUnmet) : 0;
          const dailyUpgCommission = upg * upgRate;

          totalAct += act;
          totalChi += chi;
          totalUpg += upg;
          actCommission += dailyActCommission;
          upgCommission += dailyUpgCommission;

          dailyRows.push({
            date,
            storeCode,
            act,
            chi,
            commissionableAct,
            actGoal: config.actGoal,
            actRate,
            actCommission: round2(dailyActCommission),
            upg,
            upgGoal: config.upgGoal,
            upgRate,
            upgCommission: round2(dailyUpgCommission),
            total: round2(dailyActCommission + dailyUpgCommission)
          });
        });
      });
    }

    const boxes = totalAct + totalUpg;
    const boxCommission = round2(actCommission + upgCommission);

    // Main store = store where the advocate sold the most boxes.
    const mainStore =
      Object.entries(storeBoxCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const storeBreakdown = Array.from(storesUsed)
      .sort((a, b) => (storeBoxCount[b] || 0) - (storeBoxCount[a] || 0))
      .map((storeCode) => {
        const config = getStoreConfig(storeCode);
        return {
          storeCode,
          tier: config.tier,
          actGoal: config.actGoal,
          upgGoal: config.upgGoal,
          boxes: storeBoxCount[storeCode] || 0
        };
      });

    const tiersUsed = new Set(storeBreakdown.map((entry) => entry.tier));
    const tierLabel =
      tiersUsed.size === 0 ? "N/A" : tiersUsed.size === 1 ? `Tier ${[...tiersUsed][0]}` : "Mixed Tiers";

    // ---- Accessory commission ----
    // Prefer the official metrics figure: it is ATT's system-of-record Accessory
    // Revenue, already netted of returns and covering every location. The sales
    // file is only a fallback for advocates missing from the metrics export.
    const accessoryRevenueSource =
      metricEntry && metricEntry.accessoryRevenue !== null && metricEntry.accessoryRevenue !== undefined
        ? metricEntry.accessoryRevenue
        : salesEntry?.accessoryRevenue ?? 0;
    const accessoryRevenue = round2(accessoryRevenueSource);
    const accessoryCommission = round2(accessoryRevenue * merged.accessoryPct);

    // ---- KPI bonus ----
    const kpiValues = metricEntry
      ? {
          gross_adds_pct:
            boxes > 0 && metricEntry.totalConnectedGrossAdds !== null
              ? round1((metricEntry.totalConnectedGrossAdds / boxes) * 100)
              : null,
          autopay_pct:
            metricEntry.autopayRate !== null ? round1(metricEntry.autopayRate * 100) : null,
          protect_pct:
            metricEntry.protectRate !== null ? round1(metricEntry.protectRate * 100) : null,
          acc_per_opp:
            metricEntry.accessoryRevenuePerOpp !== null
              ? round1(metricEntry.accessoryRevenuePerOpp)
              : null,
          add_a_line_pct:
            metricEntry.addALinePct !== null ? round1(metricEntry.addALinePct * 100) : null
        }
      : {};

    const kpiDetails = Object.keys(DEFAULT_KPI_THRESHOLDS).map((key) => {
      const value = kpiValues[key] ?? null;
      const threshold = thresholds[key];
      return {
        key,
        label: KPI_LABELS[key] || key,
        value,
        threshold,
        met: value !== null && value >= threshold
      };
    });
    const kpisHit = kpiDetails.filter((entry) => entry.met).length;

    const mainStoreConfig = mainStore ? getStoreConfig(mainStore) : null;
    const kpiRate =
      advocateConfig?.kpiRateOverride ?? mainStoreConfig?.kpiRate ?? merged.defaultKpiRate;
    const kpiBonus = round2(kpisHit * kpiRate);

    // ---- HI commission ----
    // Pay on the official metrics figures, matching ATT's payable result:
    // Gross Adds (activated units) first, then Orders. The sales-file gateway
    // device count is only a fallback for advocates missing from the metrics
    // export - a device receipt alone (moved/install-pending) is not payable.
    let hiQty = salesEntry ? salesEntry.hiQty || 0 : 0;
    let hiSource = "sales-devices";
    if (metricEntry) {
      if (metricEntry.homeInternetGrossAdds !== null && metricEntry.homeInternetGrossAdds !== undefined) {
        hiQty = metricEntry.homeInternetGrossAdds;
        hiSource = "official-gross-adds";
      } else if (metricEntry.homeInternetOrders !== null && metricEntry.homeInternetOrders !== undefined) {
        hiQty = metricEntry.homeInternetOrders;
        hiSource = "official-orders";
      }
    }
    const hiCommission = round2(hiQty * merged.hiRate);

    // ---- Adjustments & total ----
    const adjustment = adjustmentMap[employeeId] || null;
    const adjustmentAmount = round2(adjustment?.amount || 0);

    const total = round2(
      boxCommission + accessoryCommission + kpiBonus + hiCommission + adjustmentAmount
    );

    results.push({
      employeeId,
      name: displayName,
      mainStore,
      tierLabel,
      boxes,
      totalAct,
      totalChi,
      commissionableAct: Math.max(0, totalAct - totalChi),
      totalUpg,
      actCommission: round2(actCommission),
      upgCommission: round2(upgCommission),
      boxCommission,
      accessoryRevenue,
      accessoryCommission,
      kpisHit,
      kpiRate: round2(kpiRate),
      kpiBonus,
      kpiDetails,
      hiQty,
      hiSource,
      hiCommission,
      adjustment: adjustmentAmount,
      adjustmentNote: adjustment?.note || null,
      total,
      hasSales: Boolean(salesEntry),
      hasMetrics: Boolean(metricEntry),
      storeBreakdown,
      dailyRows,
      rates: {
        actRateMet: merged.actRateMet,
        actRateUnmet: merged.actRateUnmet,
        upgRateMet: merged.upgRateMet,
        upgRateUnmet: merged.upgRateUnmet,
        accessoryPct: merged.accessoryPct,
        hiRate: merged.hiRate
      }
    });
  });

  results.sort((a, b) => b.total - a.total);

  const totals = {
    totalCommission: round2(results.reduce((sum, entry) => sum + entry.total, 0)),
    advocateCount: results.length,
    average: results.length
      ? round2(results.reduce((sum, entry) => sum + entry.total, 0) / results.length)
      : 0,
    highest: results.length ? results[0].total : 0,
    lowest: results.length ? results[results.length - 1].total : 0,
    topEarner: results.length ? results[0].name : null,
    storeCount: new Set(results.map((entry) => entry.mainStore).filter(Boolean)).size
  };

  return { results, totals };
}

module.exports = { computeCommission, DEFAULT_KPI_THRESHOLDS, DEFAULT_SETTINGS, DEFAULT_STORE_CONFIG };
