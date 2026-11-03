import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./CommissionCenter.css";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function defaultMonth() {
  // Commission is normally run for the previous (completed) month.
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
}

function money(value) {
  return (Number(value) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}

export default function CommissionCenter({ api, currentUser }) {
  const [month, setMonth] = useState(defaultMonth());
  const [view, setView] = useState("advocates");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [showUploads, setShowUploads] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [uploadBusy, setUploadBusy] = useState("");
  const [deleteBusy, setDeleteBusy] = useState("");
  const [exporting, setExporting] = useState(false);
  const [expandedId, setExpandedId] = useState("");
  const [search, setSearch] = useState("");
  const [adjustmentDrafts, setAdjustmentDrafts] = useState({});
  const [savingAdjustmentId, setSavingAdjustmentId] = useState("");

  const [settingsDraft, setSettingsDraft] = useState(null);
  const [storeDrafts, setStoreDrafts] = useState([]);
  const [advocateDrafts, setAdvocateDrafts] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);

  const salesInputRef = useRef(null);
  const metricsInputRef = useRef(null);

  const run = overview?.run && overview.run.month === month ? overview.run : null;

  const loadOverview = useCallback(async (targetMonth, { quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
    }
    try {
      const response = await api.get("/api/commission/overview", { params: { month: targetMonth } });
      const data = response.data;
      setOverview(data);
      setSettingsDraft({
        ...data.settings,
        kpiThresholds: { ...data.settings.kpiThresholds }
      });
      setStoreDrafts(data.storeConfigs.map((store) => ({ ...store })));
      setAdvocateDrafts(
        data.advocates.map((advocate) => ({
          ...advocate,
          kpiRateOverride: advocate.kpiRateOverride === null ? "" : String(advocate.kpiRateOverride)
        }))
      );
      setStatus("");
    } catch (error) {
      setStatus(error?.response?.data?.message || "Could not load commission data.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    setExpandedId("");
    setValidation(null);
    loadOverview(month);
  }, [month, loadOverview]);

  const onValidate = async () => {
    setValidating(true);
    try {
      const response = await api.post("/api/commission/validate", { month });
      setValidation(response.data);
      setStatus(response.data?.message || "Validation finished.");
    } catch (error) {
      setValidation(null);
      setStatus(error?.response?.data?.message || "Could not validate the uploaded data.");
    } finally {
      setValidating(false);
    }
  };

  const onUpload = async (kind, file) => {
    if (!file) {
      return;
    }
    setUploadBusy(kind);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("month", month);
      const response = await api.post(`/api/commission/uploads/${kind}`, form, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setStatus(response.data?.message || "Uploaded.");
      setValidation(null);
      await loadOverview(month, { quiet: true });
    } catch (error) {
      setStatus(error?.response?.data?.message || "Upload failed.");
    } finally {
      setUploadBusy("");
      if (salesInputRef.current) salesInputRef.current.value = "";
      if (metricsInputRef.current) metricsInputRef.current.value = "";
    }
  };

  const onDeleteDataset = async (kind) => {
    setDeleteBusy(kind);
    try {
      await api.delete(`/api/commission/datasets/${kind}`, { params: { month } });
      setStatus("Dataset removed.");
      setValidation(null);
      await loadOverview(month, { quiet: true });
    } catch (error) {
      setStatus(error?.response?.data?.message || "Could not remove dataset.");
    } finally {
      setDeleteBusy("");
    }
  };

  const onRun = async () => {
    setRunning(true);
    try {
      const response = await api.post("/api/commission/run", { month });
      setStatus(response.data?.message || "Commission calculated.");
      await loadOverview(month, { quiet: true });
    } catch (error) {
      setStatus(error?.response?.data?.message || "Could not run the commission.");
    } finally {
      setRunning(false);
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const response = await api.get("/api/commission/export", {
        params: { month },
        responseType: "blob"
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `AdvocateCommission_${month}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStatus(error?.response?.data?.message || "Could not export the workbook.");
    } finally {
      setExporting(false);
    }
  };

  const onSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put("/api/commission/settings", settingsDraft);
      if (storeDrafts.length > 0) {
        await api.put("/api/commission/stores", { stores: storeDrafts });
      }
      for (const advocate of advocateDrafts) {
        const original = overview.advocates.find((entry) => entry.employeeId === advocate.employeeId);
        const draftOverride = advocate.kpiRateOverride === "" ? null : Number(advocate.kpiRateOverride);
        if (
          original &&
          (original.isActive !== advocate.isActive || original.kpiRateOverride !== draftOverride)
        ) {
          await api.patch(`/api/commission/advocates/${advocate.employeeId}`, {
            isActive: advocate.isActive,
            kpiRateOverride: draftOverride
          });
        }
      }
      setStatus("Configuration saved. Re-run the commission to apply changes.");
      await loadOverview(month, { quiet: true });
    } catch (error) {
      setStatus(error?.response?.data?.message || "Could not save configuration.");
    } finally {
      setSavingSettings(false);
    }
  };

  const onSaveAdjustment = async (employeeId) => {
    const draft = adjustmentDrafts[employeeId] || {};
    const amount = Number(draft.amount || 0);
    if (!Number.isFinite(amount)) {
      setStatus("Adjustment must be a number.");
      return;
    }
    setSavingAdjustmentId(employeeId);
    try {
      await api.put("/api/commission/adjustments", {
        month,
        employeeId,
        amount,
        note: draft.note || ""
      });
      await api.post("/api/commission/run", { month });
      setStatus("Adjustment saved and commission re-calculated.");
      await loadOverview(month, { quiet: true });
    } catch (error) {
      setStatus(error?.response?.data?.message || "Could not save adjustment.");
    } finally {
      setSavingAdjustmentId("");
    }
  };

  const results = useMemo(() => run?.results || [], [run]);

  const filteredResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return results;
    }
    return results.filter((entry) =>
      [entry.name, entry.employeeId, entry.mainStore]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [results, search]);

  const myResult = useMemo(() => {
    const myName = String(currentUser?.name || "").trim().toLowerCase();
    if (!myName) {
      return null;
    }
    return results.find((entry) => entry.name.trim().toLowerCase() === myName) || null;
  }, [results, currentUser]);

  const salesDataset = overview?.datasets?.sales || null;
  const metricsDataset = overview?.datasets?.metrics || null;
  const validationPassed = Boolean(validation?.ok && validation.month === month);

  const renderAudit = (entry) => {
    const draft = adjustmentDrafts[entry.employeeId] || {
      amount: entry.adjustment ? String(entry.adjustment) : "",
      note: entry.adjustmentNote || ""
    };

    return (
      <div className="cc-audit">
        <div className="cc-audit-head">
          <p className="cc-audit-title">Calculation Audit</p>
          <div className="cc-audit-meta">
            <span>Match Method: <strong>employee_id</strong> ({entry.employeeId})</span>
            <span>Tier: <strong className="cc-tier">{entry.tierLabel}</strong></span>
            <span>ACT Rate (met/unmet): <strong>${entry.rates.actRateMet}/${entry.rates.actRateUnmet}</strong></span>
            <span>UPG Rate (met/unmet): <strong>${entry.rates.upgRateMet}/${entry.rates.upgRateUnmet}</strong></span>
            <span>Stores Used: <strong>{entry.storeBreakdown.map((store) => store.storeCode).join(", ") || "-"}</strong></span>
            <span>Has Sales: <strong>{entry.hasSales ? "Yes" : "No"}</strong> | Has Metrics: <strong>{entry.hasMetrics ? "Yes" : "No"}</strong></span>
          </div>
        </div>

        {entry.storeBreakdown.length > 0 && (
          <div className="cc-audit-stores">
            <p className="cc-audit-subtitle">Tier / Store Breakdown</p>
            {entry.storeBreakdown.map((store) => (
              <div key={store.storeCode} className="cc-audit-store-row">
                <span className="cc-store-code">{store.storeCode}</span>
                <span className="cc-tier">Tier {store.tier}</span>
                <span>ACT Goal: <strong>{store.actGoal}</strong></span>
                <span>UPG Goal: <strong>{store.upgGoal}</strong></span>
                <span>{store.boxes} boxes</span>
              </div>
            ))}
          </div>
        )}

        <div className="cc-audit-grid">
          <div className="cc-audit-card">
            <p className="cc-audit-subtitle">Boxes Commission</p>
            <p>
              Activations: {entry.totalAct} - {entry.totalChi} CHI = {entry.commissionableAct} commissionable
              {" -> "}{money(entry.actCommission)}
            </p>
            <p>Upgrades: {entry.totalUpg} {" -> "} {money(entry.upgCommission)}</p>
            <p className="cc-audit-total">Total: {money(entry.boxCommission)}</p>
          </div>

          <div className="cc-audit-card">
            <p className="cc-audit-subtitle">Accessory Commission</p>
            <p>Revenue: {money(entry.accessoryRevenue)} x {(entry.rates.accessoryPct * 100).toFixed(1)}%</p>
            <p className="cc-audit-total">Total: {money(entry.accessoryCommission)}</p>
          </div>

          <div className="cc-audit-card">
            <p className="cc-audit-subtitle">KPI Bonus</p>
            <p>KPIs Hit: {entry.kpisHit} x {money(entry.kpiRate)}</p>
            <ul className="cc-kpi-list">
              {entry.kpiDetails.map((kpi) => (
                <li key={kpi.key} className={kpi.met ? "met" : "missed"}>
                  {kpi.label}: {kpi.value === null ? "n/a" : kpi.value} / {kpi.threshold} {kpi.met ? "\u2713" : "\u2717"}
                </li>
              ))}
            </ul>
            <p className="cc-audit-total">Total: {money(entry.kpiBonus)}</p>
          </div>

          <div className="cc-audit-card">
            <p className="cc-audit-subtitle">HI Commission</p>
            <p>HI (Cricket Gateway): {entry.hiQty} x {money(entry.rates.hiRate)}</p>
            <p className="cc-audit-total">Total: {money(entry.hiCommission)}</p>
          </div>

          <div className="cc-audit-card">
            <p className="cc-audit-subtitle">Adjustment</p>
            <div className="cc-adjust-row">
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={draft.amount}
                onChange={(event) =>
                  setAdjustmentDrafts((previous) => ({
                    ...previous,
                    [entry.employeeId]: { ...draft, amount: event.target.value }
                  }))
                }
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={draft.note}
                onChange={(event) =>
                  setAdjustmentDrafts((previous) => ({
                    ...previous,
                    [entry.employeeId]: { ...draft, note: event.target.value }
                  }))
                }
              />
              <button
                type="button"
                className="cc-btn"
                disabled={savingAdjustmentId === entry.employeeId}
                onClick={() => onSaveAdjustment(entry.employeeId)}
              >
                {savingAdjustmentId === entry.employeeId ? "Saving..." : "Save & Re-run"}
              </button>
            </div>
            <p className="cc-audit-total">Applied: {money(entry.adjustment)}</p>
          </div>
        </div>

        {entry.dailyRows.length > 0 && (
          <details className="cc-daily">
            <summary>Daily box breakdown ({entry.dailyRows.length} days)</summary>
            <div className="cc-table-scroll">
              <table className="cc-table cc-daily-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Store</th><th>ACT</th><th>CHI</th><th>Comm. ACT</th>
                    <th>Goal</th><th>Rate</th><th>ACT $</th><th>UPG</th><th>Goal</th><th>Rate</th><th>UPG $</th><th>Day $</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.dailyRows.map((day) => (
                    <tr key={`${day.date}-${day.storeCode}`}>
                      <td>{day.date}</td><td>{day.storeCode}</td><td>{day.act}</td><td>{day.chi}</td>
                      <td>{day.commissionableAct}</td><td>{day.actGoal}</td><td>${day.actRate}</td>
                      <td>{money(day.actCommission)}</td><td>{day.upg}</td><td>{day.upgGoal}</td>
                      <td>${day.upgRate}</td><td>{money(day.upgCommission)}</td>
                      <td><strong>{money(day.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    );
  };

  const renderResultsTable = (rows, { expandable = true } = {}) => (
    <div className="cc-table-scroll">
      <table className="cc-table cc-results-table">
        <thead>
          <tr>
            <th aria-label="Expand" />
            <th>Name</th>
            <th>Store</th>
            <th className="num">Boxes</th>
            <th className="num">Box Comm</th>
            <th className="num">Acc Rev</th>
            <th className="num">Acc Comm</th>
            <th className="num">KPI</th>
            <th className="num">Special</th>
            <th className="num">Adjustments</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <WithAudit key={entry.employeeId} expanded={expandable && expandedId === entry.employeeId} audit={renderAudit(entry)}>
              <tr
                className={expandable ? "cc-row-clickable" : ""}
                onClick={() =>
                  expandable &&
                  setExpandedId((previous) => (previous === entry.employeeId ? "" : entry.employeeId))
                }
              >
                <td className="cc-expander">{expandable ? (expandedId === entry.employeeId ? "\u2304" : "\u203a") : ""}</td>
                <td className="cc-name">{entry.name}</td>
                <td>{entry.mainStore || "-"}</td>
                <td className="num">{entry.boxes}</td>
                <td className="num">{money(entry.boxCommission)}</td>
                <td className="num">{money(entry.accessoryRevenue)}</td>
                <td className="num">{money(entry.accessoryCommission)}</td>
                <td className="num">{money(entry.kpiBonus)}</td>
                <td className="num">{money(entry.hiCommission)}</td>
                <td className="num">{money(entry.adjustment)}</td>
                <td className="num cc-total">{money(entry.total)}</td>
              </tr>
            </WithAudit>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="cc-root">
      <div className="cc-view-tabs" role="tablist" aria-label="Commission views">
        <button
          type="button"
          role="tab"
          aria-selected={view === "mine"}
          className={view === "mine" ? "active" : ""}
          onClick={() => setView("mine")}
        >
          My Commission
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "advocates"}
          className={view === "advocates" ? "active" : ""}
          onClick={() => setView("advocates")}
        >
          My Advocates
        </button>
      </div>

      <div className="cc-month-row">
        <button type="button" className="cc-btn ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          &larr; Prev
        </button>
        <h2 className="cc-month-label">{monthLabel(month)}</h2>
        <button type="button" className="cc-btn ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          Next &rarr;
        </button>
        {run && (
          <span className="cc-run-meta">
            Last run: {new Date(run.ranAt).toLocaleString()}
          </span>
        )}
        <button type="button" className="cc-btn ghost cc-settings-toggle" onClick={() => setShowSettings((value) => !value)}>
          {showSettings ? "Hide Settings" : "Settings"}
        </button>
      </div>

      {status && (
        <div className="cc-status" role="status" aria-live="polite">
          {status}
        </div>
      )}

      {showSettings && settingsDraft && (
        <section className="cc-panel cc-settings">
          <header className="cc-panel-head">
            <div>
              <p className="cc-panel-title">Commission Settings</p>
              <p className="cc-panel-sub">Rates, store tiers and advocate roster. Changes apply on the next run.</p>
            </div>
            <button type="button" className="cc-btn" disabled={savingSettings} onClick={onSaveSettings}>
              {savingSettings ? "Saving..." : "Save All"}
            </button>
          </header>

          <div className="cc-settings-grid">
            <label>ACT rate (goal met)
              <input type="number" step="0.5" value={settingsDraft.actRateMet}
                onChange={(e) => setSettingsDraft((s) => ({ ...s, actRateMet: e.target.value }))} />
            </label>
            <label>ACT rate (unmet)
              <input type="number" step="0.5" value={settingsDraft.actRateUnmet}
                onChange={(e) => setSettingsDraft((s) => ({ ...s, actRateUnmet: e.target.value }))} />
            </label>
            <label>UPG rate (goal met)
              <input type="number" step="0.5" value={settingsDraft.upgRateMet}
                onChange={(e) => setSettingsDraft((s) => ({ ...s, upgRateMet: e.target.value }))} />
            </label>
            <label>UPG rate (unmet)
              <input type="number" step="0.5" value={settingsDraft.upgRateUnmet}
                onChange={(e) => setSettingsDraft((s) => ({ ...s, upgRateUnmet: e.target.value }))} />
            </label>
            <label>Accessory %
              <input type="number" step="0.01" value={settingsDraft.accessoryPct}
                onChange={(e) => setSettingsDraft((s) => ({ ...s, accessoryPct: e.target.value }))} />
            </label>
            <label>HI rate
              <input type="number" step="1" value={settingsDraft.hiRate}
                onChange={(e) => setSettingsDraft((s) => ({ ...s, hiRate: e.target.value }))} />
            </label>
            <label>Default KPI rate
              <input type="number" step="1" value={settingsDraft.defaultKpiRate}
                onChange={(e) => setSettingsDraft((s) => ({ ...s, defaultKpiRate: e.target.value }))} />
            </label>
          </div>

          <p className="cc-panel-subtitle">KPI thresholds</p>
          <div className="cc-settings-grid">
            {Object.entries(settingsDraft.kpiThresholds || {}).map(([key, value]) => (
              <label key={key}>{key}
                <input
                  type="number"
                  step="1"
                  value={value}
                  onChange={(e) =>
                    setSettingsDraft((s) => ({
                      ...s,
                      kpiThresholds: { ...s.kpiThresholds, [key]: e.target.value }
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <p className="cc-panel-subtitle">Store tiers (seeded from uploaded sales data)</p>
          {storeDrafts.length === 0 ? (
            <p className="cc-empty">Upload a sales report to discover stores.</p>
          ) : (
            <div className="cc-table-scroll">
              <table className="cc-table">
                <thead>
                  <tr><th>Store</th><th>Tier</th><th>ACT Goal</th><th>UPG Goal</th><th>KPI Rate ($/hit)</th></tr>
                </thead>
                <tbody>
                  {storeDrafts.map((store, index) => (
                    <tr key={store.storeCode}>
                      <td><strong>{store.storeCode}</strong></td>
                      <td>
                        <input value={store.tier}
                          onChange={(e) => setStoreDrafts((d) => d.map((s, i) => (i === index ? { ...s, tier: e.target.value } : s)))} />
                      </td>
                      <td>
                        <input type="number" value={store.actGoal}
                          onChange={(e) => setStoreDrafts((d) => d.map((s, i) => (i === index ? { ...s, actGoal: e.target.value } : s)))} />
                      </td>
                      <td>
                        <input type="number" value={store.upgGoal}
                          onChange={(e) => setStoreDrafts((d) => d.map((s, i) => (i === index ? { ...s, upgGoal: e.target.value } : s)))} />
                      </td>
                      <td>
                        <input type="number" value={store.kpiRate}
                          onChange={(e) => setStoreDrafts((d) => d.map((s, i) => (i === index ? { ...s, kpiRate: e.target.value } : s)))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="cc-panel-subtitle">Advocates (seeded from uploads - matched by employee ID)</p>
          {advocateDrafts.length === 0 ? (
            <p className="cc-empty">Upload sales + metrics for a month to discover advocates.</p>
          ) : (
            <div className="cc-table-scroll">
              <table className="cc-table">
                <thead>
                  <tr><th>Advocate</th><th>Employee ID</th><th>KPI rate override</th><th>Active</th></tr>
                </thead>
                <tbody>
                  {advocateDrafts.map((advocate, index) => (
                    <tr key={advocate.employeeId}>
                      <td>{advocate.displayName}</td>
                      <td>{advocate.employeeId}</td>
                      <td>
                        <input type="number" placeholder="store default" value={advocate.kpiRateOverride}
                          onChange={(e) => setAdvocateDrafts((d) => d.map((a, i) => (i === index ? { ...a, kpiRateOverride: e.target.value } : a)))} />
                      </td>
                      <td>
                        <input type="checkbox" checked={advocate.isActive}
                          onChange={(e) => setAdvocateDrafts((d) => d.map((a, i) => (i === index ? { ...a, isActive: e.target.checked } : a)))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="cc-panel">
        <header className="cc-panel-head cc-clickable" onClick={() => setShowUploads((value) => !value)}>
          <div>
            <p className="cc-panel-title">{showUploads ? "\u2304" : "\u203a"} Data Uploads - {month}</p>
            <p className="cc-panel-sub">Get both files for this month, then run commission</p>
          </div>
          <div className="cc-chip-row">
            <span className={`cc-chip ${salesDataset ? "ok" : ""}`}>Sales {salesDataset ? "\u2713" : "\u2717"}</span>
            <span className={`cc-chip ${metricsDataset ? "ok" : ""}`}>Metrics {metricsDataset ? "\u2713" : "\u2717"}</span>
          </div>
        </header>

        {showUploads && (
          <div className="cc-uploads-grid">
            <div className="cc-upload-card">
              <p className="cc-upload-title">Monthly Sales By Product</p>
              {salesDataset ? (
                <span className="cc-chip ok">{salesDataset.rowCount} rows</span>
              ) : (
                <span className="cc-chip">missing</span>
              )}
              <div className="cc-upload-actions">
                <button
                  type="button"
                  className="cc-btn"
                  disabled={uploadBusy === "sales"}
                  onClick={() => salesInputRef.current?.click()}
                >
                  {uploadBusy === "sales" ? "Uploading..." : "Upload"}
                </button>
                {salesDataset && (
                  <button
                    type="button"
                    className="cc-btn danger"
                    disabled={deleteBusy === "sales"}
                    onClick={() => onDeleteDataset("sales")}
                  >
                    Delete
                  </button>
                )}
                <input
                  ref={salesInputRef}
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(event) => onUpload("sales", event.target.files?.[0])}
                />
              </div>
            </div>

            <div className="cc-upload-card">
              <p className="cc-upload-title">Metrics Advocate</p>
              {metricsDataset ? (
                <span className="cc-chip ok">{metricsDataset.rowCount} records</span>
              ) : (
                <span className="cc-chip">missing</span>
              )}
              <div className="cc-upload-actions">
                <button
                  type="button"
                  className="cc-btn ghost"
                  disabled={uploadBusy === "metrics"}
                  onClick={() => metricsInputRef.current?.click()}
                >
                  {uploadBusy === "metrics" ? "Uploading..." : "Upload"}
                </button>
                {metricsDataset && (
                  <button
                    type="button"
                    className="cc-btn danger"
                    disabled={deleteBusy === "metrics"}
                    onClick={() => onDeleteDataset("metrics")}
                  >
                    Delete
                  </button>
                )}
                <input
                  ref={metricsInputRef}
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(event) => onUpload("metrics", event.target.files?.[0])}
                />
              </div>
            </div>

            <div className="cc-upload-card">
              <p className="cc-upload-title">Commission Results</p>
              {run ? (
                <span className="cc-chip ok">{run.results.length} results</span>
              ) : (
                <span className="cc-chip">not run yet</span>
              )}
              <div className="cc-upload-actions cc-run-actions">
                <button
                  type="button"
                  className="cc-btn"
                  disabled={validating || !salesDataset || !metricsDataset}
                  onClick={onValidate}
                >
                  {validating ? "Validating..." : "\u24d8 Validate"}
                </button>
                <button
                  type="button"
                  className="cc-btn primary"
                  disabled={running || !validationPassed}
                  title={validationPassed ? "" : "Run Validate first - it must pass before the commission can run."}
                  onClick={onRun}
                >
                  {running ? "Running..." : "\u25b6 Run Commission"}
                </button>
              </div>
            </div>
          </div>
        )}

        {validation && validation.month === month && (
          <div className={`cc-validation ${validation.ok ? "ok" : "failed"}`}>
            <p className="cc-validation-title">
              {validation.ok ? "\u2713 Validation passed" : "\u2717 Validation failed"}
            </p>
            <ul className="cc-validation-list">
              {validation.checks.map((check) => (
                <li key={check.label} className={check.status}>
                  <span className="cc-validation-mark">
                    {check.status === "pass" ? "\u2713" : check.status === "warn" ? "\u26a0" : "\u2717"}
                  </span>
                  <span>
                    <strong>{check.label}:</strong> {check.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {loading ? (
        <p className="cc-empty">Loading commission data...</p>
      ) : !run ? (
        <section className="cc-panel">
          <p className="cc-empty">
            No commission run for {monthLabel(month)} yet. Upload both files above, then press Run Commission.
          </p>
        </section>
      ) : (
        <>
          <div className="cc-cards">
            <div className="cc-card">
              <p className="cc-card-label">Total Commission</p>
              <p className="cc-card-value">{money(run.totals.totalCommission)}</p>
              <p className="cc-card-sub">{run.totals.storeCount} stores</p>
            </div>
            <div className="cc-card">
              <p className="cc-card-label">Advocates</p>
              <p className="cc-card-value">{run.totals.advocateCount}</p>
            </div>
            <div className="cc-card">
              <p className="cc-card-label">Avg / Highest</p>
              <p className="cc-card-value">{money(run.totals.average)}</p>
              <p className="cc-card-sub">High: {money(run.totals.highest)} - Low: {money(run.totals.lowest)}</p>
            </div>
            <div className="cc-card">
              <p className="cc-card-label">Top Earner</p>
              <p className="cc-card-value cc-card-name">{run.totals.topEarner || "-"}</p>
            </div>
          </div>

          {view === "advocates" ? (
            <section className="cc-panel">
              <header className="cc-panel-head">
                <p className="cc-panel-title">Advocate Commission Results</p>
                <div className="cc-results-tools">
                  <input
                    type="search"
                    placeholder="Search advocate or store..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <button type="button" className="cc-btn ghost" disabled={exporting} onClick={onExport}>
                    {exporting ? "Exporting..." : "\u2913 Export"}
                  </button>
                </div>
              </header>
              {filteredResults.length === 0 ? (
                <p className="cc-empty">No advocates match.</p>
              ) : (
                renderResultsTable(filteredResults)
              )}
            </section>
          ) : (
            <section className="cc-panel">
              <header className="cc-panel-head">
                <p className="cc-panel-title">My Commission</p>
              </header>
              {myResult ? (
                <>
                  {renderResultsTable([myResult], { expandable: false })}
                  {renderAudit(myResult)}
                </>
              ) : (
                <p className="cc-empty">
                  No result found for "{currentUser?.name}" in this run. Your app account name must match your
                  advocate name from the reports.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function WithAudit({ children, expanded, audit }) {
  return (
    <>
      {children}
      {expanded && (
        <tr className="cc-audit-row">
          <td colSpan={11}>{audit}</td>
        </tr>
      )}
    </>
  );
}
