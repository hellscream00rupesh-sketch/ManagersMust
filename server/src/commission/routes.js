const multer = require("multer");

const { parseSalesReport, parseMetricsReport, normalizeEmployeeId } = require("./parse");
const { computeCommission, DEFAULT_SETTINGS, DEFAULT_KPI_THRESHOLDS } = require("./calc");
const { buildCommissionWorkbook } = require("./export");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }
});

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function normalizeMonth(value) {
  const month = String(value || "").trim();
  return MONTH_PATTERN.test(month) ? month : null;
}

function registerCommissionRoutes(app, { pool, requireAuth, requireCommissionAccess, resolveManagerScopeId }) {
  // ---------- helpers ----------

  async function loadSettings(managerId) {
    const [rows] = await pool.query(
      `SELECT act_rate_met AS actRateMet, act_rate_unmet AS actRateUnmet,
              upg_rate_met AS upgRateMet, upg_rate_unmet AS upgRateUnmet,
              accessory_pct AS accessoryPct, hi_rate AS hiRate,
              default_kpi_rate AS defaultKpiRate, kpi_thresholds AS kpiThresholds
       FROM commission_settings WHERE manager_id = ?`,
      [managerId]
    );

    if (rows.length === 0) {
      return { ...DEFAULT_SETTINGS };
    }

    const row = rows[0];
    let thresholds = DEFAULT_KPI_THRESHOLDS;
    if (row.kpiThresholds) {
      try {
        thresholds = { ...DEFAULT_KPI_THRESHOLDS, ...(typeof row.kpiThresholds === "string" ? JSON.parse(row.kpiThresholds) : row.kpiThresholds) };
      } catch {
        thresholds = DEFAULT_KPI_THRESHOLDS;
      }
    }

    return {
      actRateMet: Number(row.actRateMet),
      actRateUnmet: Number(row.actRateUnmet),
      upgRateMet: Number(row.upgRateMet),
      upgRateUnmet: Number(row.upgRateUnmet),
      accessoryPct: Number(row.accessoryPct),
      hiRate: Number(row.hiRate),
      defaultKpiRate: Number(row.defaultKpiRate),
      kpiThresholds: thresholds
    };
  }

  async function loadStoreConfigs(managerId) {
    const [rows] = await pool.query(
      `SELECT store_code AS storeCode, tier, act_goal AS actGoal, upg_goal AS upgGoal, kpi_rate AS kpiRate
       FROM commission_store_configs WHERE manager_id = ? ORDER BY store_code ASC`,
      [managerId]
    );
    const map = {};
    rows.forEach((row) => {
      map[row.storeCode] = {
        storeCode: row.storeCode,
        tier: row.tier,
        actGoal: Number(row.actGoal),
        upgGoal: Number(row.upgGoal),
        kpiRate: Number(row.kpiRate)
      };
    });
    return map;
  }

  async function loadAdvocates(managerId) {
    const [rows] = await pool.query(
      `SELECT employee_id AS employeeId, display_name AS displayName,
              kpi_rate_override AS kpiRateOverride, is_active AS isActive
       FROM commission_advocates WHERE manager_id = ? ORDER BY display_name ASC`,
      [managerId]
    );
    const map = {};
    rows.forEach((row) => {
      map[row.employeeId] = {
        employeeId: row.employeeId,
        displayName: row.displayName,
        kpiRateOverride: row.kpiRateOverride === null ? null : Number(row.kpiRateOverride),
        isActive: Boolean(row.isActive)
      };
    });
    return map;
  }

  async function loadAdjustments(managerId, month) {
    const [rows] = await pool.query(
      `SELECT employee_id AS employeeId, amount, note
       FROM commission_adjustments WHERE manager_id = ? AND month = ?`,
      [managerId, month]
    );
    const map = {};
    rows.forEach((row) => {
      map[row.employeeId] = { amount: Number(row.amount), note: row.note };
    });
    return map;
  }

  async function loadDataset(managerId, month, kind) {
    const [rows] = await pool.query(
      `SELECT id, source, file_name AS fileName, row_count AS rowCount, payload, created_at AS createdAt
       FROM commission_datasets WHERE manager_id = ? AND month = ? AND kind = ?`,
      [managerId, month, kind]
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    let payload = null;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      payload = null;
    }
    return {
      source: row.source,
      fileName: row.fileName,
      rowCount: Number(row.rowCount),
      createdAt: row.createdAt,
      payload
    };
  }

  async function saveDataset(managerId, month, kind, source, fileName, rowCount, payload) {
    await pool.query(
      `INSERT INTO commission_datasets (manager_id, month, kind, source, file_name, row_count, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE source = VALUES(source), file_name = VALUES(file_name),
         row_count = VALUES(row_count), payload = VALUES(payload), created_at = CURRENT_TIMESTAMP`,
      [managerId, month, kind, source, fileName, rowCount, JSON.stringify(payload)]
    );
  }

  async function seedStoreConfigs(managerId, salesPayload) {
    const storeCodes = new Set();
    Object.values(salesPayload.employees || {}).forEach((employee) => {
      Object.values(employee.days || {}).forEach((storesForDay) => {
        Object.keys(storesForDay).forEach((storeCode) => storeCodes.add(storeCode));
      });
    });
    for (const storeCode of storeCodes) {
      await pool.query(
        `INSERT IGNORE INTO commission_store_configs (manager_id, store_code) VALUES (?, ?)`,
        [managerId, storeCode]
      );
    }
  }

  async function seedAdvocates(managerId, month) {
    const [salesDataset, metricsDataset] = await Promise.all([
      loadDataset(managerId, month, "sales"),
      loadDataset(managerId, month, "metrics")
    ]);
    if (!salesDataset?.payload || !metricsDataset?.payload) {
      return;
    }

    const salesIds = new Set(Object.keys(salesDataset.payload.employees || {}));
    const metricsAdvocates = metricsDataset.payload.advocates || {};
    for (const [employeeId, metric] of Object.entries(metricsAdvocates)) {
      if (!salesIds.has(employeeId) || metric.totalConnectedGrossAdds === null) {
        continue;
      }
      await pool.query(
        `INSERT IGNORE INTO commission_advocates (manager_id, employee_id, display_name) VALUES (?, ?, ?)`,
        [managerId, employeeId, metric.name || employeeId]
      );
    }
  }

  async function runCommission(managerId, month) {
    const [salesDataset, metricsDataset, settings, storeConfigs, advocates, adjustments] =
      await Promise.all([
        loadDataset(managerId, month, "sales"),
        loadDataset(managerId, month, "metrics"),
        loadSettings(managerId),
        loadStoreConfigs(managerId),
        loadAdvocates(managerId),
        loadAdjustments(managerId, month)
      ]);

    if (!salesDataset?.payload) {
      throw new Error("Upload (or fetch) the Sales By Product report for this month first.");
    }
    if (!metricsDataset?.payload) {
      throw new Error("Upload the advocate metrics file for this month first.");
    }

    const computed = computeCommission({
      salesEmployees: salesDataset.payload.employees,
      metricsAdvocates: metricsDataset.payload.advocates,
      settings,
      storeConfigs,
      advocateConfigs: advocates,
      adjustments
    });

    const run = { month, ...computed, ranAt: new Date().toISOString() };
    await pool.query(
      `INSERT INTO commission_runs (manager_id, month, results) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE results = VALUES(results), created_at = CURRENT_TIMESTAMP`,
      [managerId, month, JSON.stringify(run)]
    );
    return run;
  }

  async function loadRun(managerId, month) {
    const [rows] = await pool.query(
      `SELECT results, created_at AS createdAt FROM commission_runs WHERE manager_id = ? AND month = ?`,
      [managerId, month]
    );
    if (rows.length === 0) {
      return null;
    }
    try {
      return JSON.parse(rows[0].results);
    } catch {
      return null;
    }
  }

  const guard = [requireAuth, requireCommissionAccess];

  // "Active Manager" accounts work inside their manager's commission workspace;
  // Managers own their own. Falls back to the account id when no resolver is given.
  function commissionManagerId(req) {
    return resolveManagerScopeId ? resolveManagerScopeId(req.auth) : commissionManagerId(req);
  }

  // ---------- overview ----------

  app.get("/api/commission/overview", ...guard, async (req, res) => {
    const month = normalizeMonth(req.query.month);
    if (!month) {
      return res.status(400).json({ message: "A month in YYYY-MM format is required." });
    }

    try {
      const managerId = commissionManagerId(req);
      const [settings, storeConfigs, advocates, adjustments, salesDataset, metricsDataset, run] =
        await Promise.all([
          loadSettings(managerId),
          loadStoreConfigs(managerId),
          loadAdvocates(managerId),
          loadAdjustments(managerId, month),
          loadDataset(managerId, month, "sales"),
          loadDataset(managerId, month, "metrics"),
          loadRun(managerId, month)
        ]);

      return res.json({
        month,
        settings,
        storeConfigs: Object.values(storeConfigs),
        advocates: Object.values(advocates),
        adjustments,
        datasets: {
          sales: salesDataset
            ? {
                source: salesDataset.source,
                fileName: salesDataset.fileName,
                rowCount: salesDataset.rowCount,
                createdAt: salesDataset.createdAt
              }
            : null,
          metrics: metricsDataset
            ? {
                source: metricsDataset.source,
                fileName: metricsDataset.fileName,
                rowCount: metricsDataset.rowCount,
                createdAt: metricsDataset.createdAt
              }
            : null
        },
        run
      });
    } catch (error) {
      return res.status(500).json({ message: "Could not load commission data.", detail: error.message });
    }
  });

  // ---------- settings / configuration ----------

  app.put("/api/commission/settings", ...guard, async (req, res) => {
    const body = req.body || {};
    const numeric = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const settings = {
      actRateMet: numeric(body.actRateMet, DEFAULT_SETTINGS.actRateMet),
      actRateUnmet: numeric(body.actRateUnmet, DEFAULT_SETTINGS.actRateUnmet),
      upgRateMet: numeric(body.upgRateMet, DEFAULT_SETTINGS.upgRateMet),
      upgRateUnmet: numeric(body.upgRateUnmet, DEFAULT_SETTINGS.upgRateUnmet),
      accessoryPct: numeric(body.accessoryPct, DEFAULT_SETTINGS.accessoryPct),
      hiRate: numeric(body.hiRate, DEFAULT_SETTINGS.hiRate),
      defaultKpiRate: numeric(body.defaultKpiRate, DEFAULT_SETTINGS.defaultKpiRate)
    };

    const thresholds = { ...DEFAULT_KPI_THRESHOLDS };
    if (body.kpiThresholds && typeof body.kpiThresholds === "object") {
      Object.keys(DEFAULT_KPI_THRESHOLDS).forEach((key) => {
        thresholds[key] = numeric(body.kpiThresholds[key], DEFAULT_KPI_THRESHOLDS[key]);
      });
    }

    try {
      await pool.query(
        `INSERT INTO commission_settings
           (manager_id, act_rate_met, act_rate_unmet, upg_rate_met, upg_rate_unmet, accessory_pct, hi_rate, default_kpi_rate, kpi_thresholds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE act_rate_met = VALUES(act_rate_met), act_rate_unmet = VALUES(act_rate_unmet),
           upg_rate_met = VALUES(upg_rate_met), upg_rate_unmet = VALUES(upg_rate_unmet),
           accessory_pct = VALUES(accessory_pct), hi_rate = VALUES(hi_rate),
           default_kpi_rate = VALUES(default_kpi_rate), kpi_thresholds = VALUES(kpi_thresholds)`,
        [
          commissionManagerId(req),
          settings.actRateMet,
          settings.actRateUnmet,
          settings.upgRateMet,
          settings.upgRateUnmet,
          settings.accessoryPct,
          settings.hiRate,
          settings.defaultKpiRate,
          JSON.stringify(thresholds)
        ]
      );
      return res.json({ message: "Commission settings saved.", settings: { ...settings, kpiThresholds: thresholds } });
    } catch (error) {
      return res.status(500).json({ message: "Could not save commission settings.", detail: error.message });
    }
  });

  app.put("/api/commission/stores", ...guard, async (req, res) => {
    const entries = Array.isArray(req.body?.stores) ? req.body.stores : [];
    if (entries.length === 0) {
      return res.status(400).json({ message: "Provide at least one store configuration." });
    }

    try {
      for (const entry of entries) {
        const storeCode = String(entry.storeCode || "").trim();
        if (!storeCode) {
          continue;
        }
        const tier = String(entry.tier || "B").trim().slice(0, 20) || "B";
        const actGoal = Math.max(0, Math.trunc(Number(entry.actGoal) || 0));
        const upgGoal = Math.max(0, Math.trunc(Number(entry.upgGoal) || 0));
        const kpiRate = Math.max(0, Number(entry.kpiRate) || 0);
        await pool.query(
          `INSERT INTO commission_store_configs (manager_id, store_code, tier, act_goal, upg_goal, kpi_rate)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE tier = VALUES(tier), act_goal = VALUES(act_goal),
             upg_goal = VALUES(upg_goal), kpi_rate = VALUES(kpi_rate)`,
          [commissionManagerId(req), storeCode, tier, actGoal, upgGoal, kpiRate]
        );
      }
      const storeConfigs = await loadStoreConfigs(commissionManagerId(req));
      return res.json({ message: "Store tiers saved.", storeConfigs: Object.values(storeConfigs) });
    } catch (error) {
      return res.status(500).json({ message: "Could not save store tiers.", detail: error.message });
    }
  });

  app.patch("/api/commission/advocates/:employeeId", ...guard, async (req, res) => {
    const employeeId = normalizeEmployeeId(req.params.employeeId);
    const body = req.body || {};

    const updates = [];
    const params = [];
    if (body.displayName !== undefined) {
      const displayName = String(body.displayName || "").trim();
      if (!displayName) {
        return res.status(400).json({ message: "Display name cannot be empty." });
      }
      updates.push("display_name = ?");
      params.push(displayName);
    }
    if (body.kpiRateOverride !== undefined) {
      if (body.kpiRateOverride === null || body.kpiRateOverride === "") {
        updates.push("kpi_rate_override = NULL");
      } else {
        const rate = Number(body.kpiRateOverride);
        if (!Number.isFinite(rate) || rate < 0) {
          return res.status(400).json({ message: "KPI rate override must be a non-negative number." });
        }
        updates.push("kpi_rate_override = ?");
        params.push(rate);
      }
    }
    if (body.isActive !== undefined) {
      updates.push("is_active = ?");
      params.push(body.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    try {
      const [result] = await pool.query(
        `UPDATE commission_advocates SET ${updates.join(", ")} WHERE manager_id = ? AND employee_id = ?`,
        [...params, commissionManagerId(req), employeeId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Advocate not found." });
      }
      const advocates = await loadAdvocates(commissionManagerId(req));
      return res.json({ message: "Advocate updated.", advocates: Object.values(advocates) });
    } catch (error) {
      return res.status(500).json({ message: "Could not update advocate.", detail: error.message });
    }
  });

  app.put("/api/commission/adjustments", ...guard, async (req, res) => {
    const month = normalizeMonth(req.body?.month);
    const employeeId = normalizeEmployeeId(req.body?.employeeId);
    const amount = Number(req.body?.amount);
    const note = String(req.body?.note || "").trim().slice(0, 255) || null;

    if (!month || !employeeId || !Number.isFinite(amount)) {
      return res.status(400).json({ message: "month, employeeId and a numeric amount are required." });
    }

    try {
      if (amount === 0 && !note) {
        await pool.query(
          "DELETE FROM commission_adjustments WHERE manager_id = ? AND month = ? AND employee_id = ?",
          [commissionManagerId(req), month, employeeId]
        );
      } else {
        await pool.query(
          `INSERT INTO commission_adjustments (manager_id, month, employee_id, amount, note)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = VALUES(amount), note = VALUES(note)`,
          [commissionManagerId(req), month, employeeId, amount, note]
        );
      }
      return res.json({ message: "Adjustment saved. Re-run the commission to apply it." });
    } catch (error) {
      return res.status(500).json({ message: "Could not save adjustment.", detail: error.message });
    }
  });

  // ---------- data uploads ----------

  app.post("/api/commission/uploads/:kind", ...guard, upload.single("file"), async (req, res) => {
    const kind = req.params.kind;
    if (kind !== "sales" && kind !== "metrics") {
      return res.status(400).json({ message: "Unknown upload kind." });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Attach an .xlsx file to upload." });
    }

    const requestedMonth = normalizeMonth(req.body?.month);
    if (!requestedMonth) {
      return res.status(400).json({ message: "A month in YYYY-MM format is required." });
    }

    try {
      const managerId = commissionManagerId(req);
      if (kind === "sales") {
        const parsed = await parseSalesReport(req.file.buffer);
        if (parsed.month && parsed.month !== requestedMonth) {
          return res.status(400).json({
            message: `This sales file looks like ${parsed.month}, not ${requestedMonth}. Switch the month or upload the right file.`
          });
        }
        await saveDataset(managerId, requestedMonth, "sales", "upload", req.file.originalname, parsed.rowCount, {
          month: requestedMonth,
          employees: parsed.employees
        });
        await seedStoreConfigs(managerId, { employees: parsed.employees });
      } else {
        const parsed = await parseMetricsReport(req.file.buffer);
        await saveDataset(managerId, requestedMonth, "metrics", "upload", req.file.originalname, parsed.rowCount, {
          month: requestedMonth,
          advocates: parsed.advocates
        });
      }

      await seedAdvocates(managerId, requestedMonth);
      return res.json({ message: `${kind === "sales" ? "Sales" : "Metrics"} data uploaded.` });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/commission/datasets/:kind", ...guard, async (req, res) => {
    const kind = req.params.kind;
    const month = normalizeMonth(req.query.month);
    if ((kind !== "sales" && kind !== "metrics") || !month) {
      return res.status(400).json({ message: "A valid kind and month are required." });
    }

    try {
      await pool.query(
        "DELETE FROM commission_datasets WHERE manager_id = ? AND month = ? AND kind = ?",
        [commissionManagerId(req), month, kind]
      );
      return res.json({ message: "Dataset removed." });
    } catch (error) {
      return res.status(500).json({ message: "Could not remove dataset.", detail: error.message });
    }
  });

  // ---------- validation ----------

  app.post("/api/commission/validate", ...guard, async (req, res) => {
    const month = normalizeMonth(req.body?.month);
    if (!month) {
      return res.status(400).json({ message: "A month in YYYY-MM format is required." });
    }

    try {
      const managerId = commissionManagerId(req);
      const [salesDataset, metricsDataset, advocates, storeConfigs] = await Promise.all([
        loadDataset(managerId, month, "sales"),
        loadDataset(managerId, month, "metrics"),
        loadAdvocates(managerId),
        loadStoreConfigs(managerId)
      ]);

      const checks = [];
      const add = (label, status, detail) => checks.push({ label, status, detail });

      if (salesDataset?.payload) {
        add("Sales file uploaded", "pass", `${salesDataset.rowCount} rows (${salesDataset.fileName || "file"})`);
      } else {
        add("Sales file uploaded", "fail", "No Sales By Product data for this month. Upload it first.");
      }

      if (metricsDataset?.payload) {
        add("Metrics file uploaded", "pass", `${metricsDataset.rowCount} advocate records (${metricsDataset.fileName || "file"})`);
      } else {
        add("Metrics file uploaded", "fail", "No advocate metrics data for this month. Upload it first.");
      }

      if (salesDataset?.payload && metricsDataset?.payload) {
        const employees = salesDataset.payload.employees || {};
        const metricAdvocates = metricsDataset.payload.advocates || {};

        // 1. All sales dates must fall inside the selected month.
        let inMonth = 0;
        let outOfMonth = 0;
        const strayMonths = new Set();
        Object.values(employees).forEach((employee) => {
          Object.keys(employee.days || {}).forEach((date) => {
            if (date.startsWith(month)) {
              inMonth += 1;
            } else {
              outOfMonth += 1;
              strayMonths.add(date.slice(0, 7));
            }
          });
        });
        if (inMonth === 0) {
          add("Sales dates match selected month", "fail", `No sales activity found inside ${month}.`);
        } else if (outOfMonth > 0) {
          add(
            "Sales dates match selected month",
            "fail",
            `${outOfMonth} day entr${outOfMonth === 1 ? "y" : "ies"} fall outside ${month} (found: ${[...strayMonths].join(", ")}). Wrong file or wrong month selected.`
          );
        } else {
          add("Sales dates match selected month", "pass", `All activity dates are within ${month}.`);
        }

        // 2. Employee IDs must line up between the two files.
        const salesIds = new Set(Object.keys(employees));
        const matched = Object.keys(metricAdvocates).filter(
          (id) => salesIds.has(id) && metricAdvocates[id].totalConnectedGrossAdds !== null
        );
        if (matched.length === 0) {
          add("Employee IDs align across files", "fail", "No employee IDs match between the sales and metrics files.");
        } else {
          add("Employee IDs align across files", "pass", `${matched.length} advocate(s) matched by employee ID.`);
        }

        // 3. Active roster coverage.
        const activeRoster = Object.values(advocates).filter((advocate) => advocate.isActive);
        if (activeRoster.length > 0) {
          const missingSales = activeRoster.filter((advocate) => !salesIds.has(advocate.employeeId));
          const missingMetrics = activeRoster.filter((advocate) => !metricAdvocates[advocate.employeeId]);
          if (missingSales.length === 0 && missingMetrics.length === 0) {
            add("Active advocates covered", "pass", `All ${activeRoster.length} active advocate(s) appear in both files.`);
          } else {
            const parts = [];
            if (missingSales.length > 0) {
              parts.push(`missing from sales: ${missingSales.map((advocate) => advocate.displayName).join(", ")}`);
            }
            if (missingMetrics.length > 0) {
              parts.push(`missing from metrics: ${missingMetrics.map((advocate) => advocate.displayName).join(", ")}`);
            }
            add("Active advocates covered", "warn", `Some active advocates will get partial results - ${parts.join("; ")}.`);
          }
        }

        // 4. Store goals configured for every store seen in the sales data.
        const storeCodes = new Set();
        Object.values(employees).forEach((employee) => {
          Object.values(employee.days || {}).forEach((storesForDay) => {
            Object.keys(storesForDay).forEach((storeCode) => storeCodes.add(storeCode));
          });
        });
        const unconfigured = [...storeCodes].filter((storeCode) => !storeConfigs[storeCode]);
        if (unconfigured.length === 0) {
          add("Store goals configured", "pass", `Goals and tiers set for all ${storeCodes.size} store(s).`);
        } else {
          add("Store goals configured", "warn", `Default goals will be used for store(s): ${unconfigured.join(", ")}. Review them in Settings.`);
        }

        // 5. Accessory revenue should line up with the official metrics file.
        //    A sales number above the metrics number usually means accessory
        //    returns/refunds failed to net out of the sales file.
        const accessoryMismatch = { over: [], under: [] };
        Object.entries(metricAdvocates).forEach(([employeeId, metric]) => {
          const salesEntry = employees[employeeId];
          if (!salesEntry || metric.accessoryRevenue === null) {
            return;
          }

          const diff = Math.round(((salesEntry.accessoryRevenue || 0) - metric.accessoryRevenue) * 100) / 100;
          if (Math.abs(diff) <= 5) {
            return;
          }

          const label = `${salesEntry.name || employeeId} (${diff > 0 ? "+" : "-"}$${Math.abs(diff).toFixed(2)})`;
          if (diff > 0) {
            accessoryMismatch.over.push(label);
          } else {
            accessoryMismatch.under.push(label);
          }
        });
        if (accessoryMismatch.over.length === 0 && accessoryMismatch.under.length === 0) {
          add("Accessory returns netted", "pass", "Sales-file accessory revenue matches the official metrics within $5 for every advocate.");
        } else {
          const parts = [];
          if (accessoryMismatch.over.length > 0) {
            parts.push(`higher than official (check accessory returns): ${accessoryMismatch.over.join(", ")}`);
          }
          if (accessoryMismatch.under.length > 0) {
            parts.push(`lower than official (sales file may exclude accessory sales outside the downloaded stores): ${accessoryMismatch.under.join(", ")}`);
          }
          add("Accessory returns netted", "warn", parts.join("; ") + ".");
        }

        // 6. Home Internet counts should line up per advocate across both files.
        const hiMismatch = [];
        Object.entries(employees).forEach(([employeeId, salesEntry]) => {
          const metric = metricAdvocates[employeeId];
          const metricHi = metric && metric.homeInternetOrders !== null ? metric.homeInternetOrders : null;
          if ((salesEntry.hiQty || 0) > 0 && metricHi === null) {
            hiMismatch.push(
              `${salesEntry.name || employeeId} (gateway devices in sales: ${salesEntry.hiQty}, official home internet orders: none)`
            );
          }
        });
        Object.entries(metricAdvocates).forEach(([employeeId, metric]) => {
          if (metric.homeInternetOrders === null) {
            return;
          }
          const salesEntry = employees[employeeId];
          const salesHi = salesEntry ? salesEntry.hiQty || 0 : 0;
          if (metric.homeInternetOrders !== salesHi) {
            hiMismatch.push(
              `${(salesEntry && salesEntry.name) || metric.name || employeeId} (gateway devices in sales: ${salesHi}, official home internet orders: ${metric.homeInternetOrders})`
            );
          }
        });
        if (hiMismatch.length === 0) {
          add(
            "Home Internet counts aligned",
            "pass",
            "Gateway device counts in the sales file match the official Home Internet orders for every advocate."
          );
        } else {
          add(
            "Home Internet counts aligned",
            "warn",
            `Gateway device attribution/count differs from official orders: ${hiMismatch.join("; ")}.`
          );
        }

        // 7. Basic data sanity.
        const totalBoxes = Object.values(employees).reduce((sum, employee) => sum + (Number(employee.boxes) || 0), 0);
        const negativeAccessory = Object.values(employees).filter((employee) => Number(employee.accessoryRevenue) < 0);
        if (totalBoxes <= 0) {
          add("Sales data sanity", "fail", "No boxes (activations/upgrades) found in the sales file.");
        } else if (negativeAccessory.length > 0) {
          add(
            "Sales data sanity",
            "warn",
            `${totalBoxes} boxes found, but negative accessory revenue for: ${negativeAccessory.map((employee) => employee.name).join(", ")}.`
          );
        } else {
          add("Sales data sanity", "pass", `${totalBoxes} boxes and ${matched.length} matched advocate(s) ready to calculate.`);
        }
      }

      const ok = checks.every((check) => check.status !== "fail");
      return res.json({
        ok,
        month,
        checks,
        message: ok ? "Validation passed. You can run the commission." : "Validation failed. Fix the issues above before running."
      });
    } catch (error) {
      return res.status(500).json({ message: "Could not validate the uploaded data.", detail: error.message });
    }
  });

  // ---------- run + export ----------

  app.post("/api/commission/run", ...guard, async (req, res) => {
    const month = normalizeMonth(req.body?.month);
    if (!month) {
      return res.status(400).json({ message: "A month in YYYY-MM format is required." });
    }

    try {
      await seedAdvocates(commissionManagerId(req), month);
      const run = await runCommission(commissionManagerId(req), month);
      return res.json({ message: "Commission calculated.", run });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/commission/export", ...guard, async (req, res) => {
    const month = normalizeMonth(req.query.month);
    if (!month) {
      return res.status(400).json({ message: "A month in YYYY-MM format is required." });
    }

    try {
      const run = await loadRun(commissionManagerId(req), month);
      if (!run) {
        return res.status(404).json({ message: "Run the commission for this month before exporting." });
      }
      const { buffer, fileName } = await buildCommissionWorkbook({ month, results: run.results });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(Buffer.from(buffer));
    } catch (error) {
      return res.status(500).json({ message: "Could not export commission workbook.", detail: error.message });
    }
  });

}

module.exports = { registerCommissionRoutes };
