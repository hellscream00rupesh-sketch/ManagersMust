import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const tokenKey = "manager_portal_token";
const userKey = "manager_portal_user";

const navItems = [
  { key: "overview", label: "Overview" },
  { key: "posts", label: "Posts" },
  { key: "stores", label: "Stores / Offices" },
  { key: "account", label: "Account" }
];

const iconPaths = {
  overview: ["M3 13h8V3H3z", "M13 21h8v-8h-8z", "M13 3h8v6h-8z", "M3 21h8v-6H3z"],
  posts: ["M4 5h16v14H4z", "M8 9h8", "M8 13h8", "M8 17h5"],
  stores: ["M4 21V8l8-5 8 5v13z", "M9 21v-6h6v6"],
  account: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 20c1.8-3 4.5-4.5 8-4.5s6.2 1.5 8 4.5"],
  plus: ["M12 5v14", "M5 12h14"],
  search: ["m21 21-4.3-4.3", "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"],
  chart: ["M4 19h16", "M7 15l3-3 3 2 4-6"],
  activity: ["M3 12h4l2.3-5 3.4 10 2.2-5H21"],
  filter: ["M4 5h16", "M7 12h10", "M10 19h4"],
  inventory: ["M4 7h16v12H4z", "M4 7l8 5 8-5", "M12 12v7"],
  warning: ["M12 3 2.8 20h18.4L12 3z", "M12 9v5", "M12 17h.01"],
  check: ["M20 6 9 17l-5-5"],
  clock: ["M12 6v6l4 2", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"],
  tag: ["M20 13 11 22l-9-9V4h9z", "M7 9h.01"],
  location: ["M12 22s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z", "M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"],
  team: ["M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M8.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  mail: ["M4 6h16v12H4z", "M4 8l8 6 8-6"],
  lock: ["M6 11h12v10H6z", "M9 11V8a3 3 0 0 1 6 0v3"],
  building: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M9 10h.01", "M15 10h.01", "M9 14h.01", "M15 14h.01"],
  phone: ["M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7 12.7 12.7 0 0 0 .7 2.8 2 2 0 0 1-.4 2.1l-1.2 1.2a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4 12.7 12.7 0 0 0 2.8.7A2 2 0 0 1 22 16.9z"],
  address: ["M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 1 1 18 0z", "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6"]
};

function UIIcon({ name, className = "" }) {
  const paths = iconPaths[name] || iconPaths.overview;
  return (
    <span className={`ui-icon ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths.map((path, index) => (
          <path key={`${name}-${index}`} d={path} />
        ))}
      </svg>
    </span>
  );
}

function getInitialUser() {
  const raw = localStorage.getItem(userKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || "");
  const [currentUser, setCurrentUser] = useState(getInitialUser());
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });

  const [stores, setStores] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [loadingInventoryCategories, setLoadingInventoryCategories] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [overviewSelectedStoreId, setOverviewSelectedStoreId] = useState("all");
  const [overviewFeedFilter, setOverviewFeedFilter] = useState("all");
  const [overviewTimeRange, setOverviewTimeRange] = useState("7d");
  const [overviewStockView, setOverviewStockView] = useState("attention");
  const [selectedStore, setSelectedStore] = useState(null);
  const [storeView, setStoreView] = useState("detail");
  const [allInventoryCategory, setAllInventoryCategory] = useState("All");
  const [cumulativeInventory, setCumulativeInventory] = useState([]);
  const [cumulativeStores, setCumulativeStores] = useState([]);
  const [selectedCumulativeStoreIds, setSelectedCumulativeStoreIds] = useState([]);
  const [loadingCumulativeInventory, setLoadingCumulativeInventory] = useState(false);
  const [editingInventoryKey, setEditingInventoryKey] = useState("");
  const [editInventoryForm, setEditInventoryForm] = useState({
    inventoryCategory: "",
    inventoryName: "",
    preferredCount: "0"
  });
  const [storeInventory, setStoreInventory] = useState([]);
  const [loadingStoreInventory, setLoadingStoreInventory] = useState(false);
  const [storeInventorySearch, setStoreInventorySearch] = useState("");
  const [storeInventoryCategoryFilter, setStoreInventoryCategoryFilter] = useState("All");
  const [storeInventoryHealthFilter, setStoreInventoryHealthFilter] = useState("all");
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [inventoryForm, setInventoryForm] = useState({
    inventoryCategory: "",
    newInventoryCategory: "",
    inventoryName: "",
    inventoryCount: "",
    preferredCount: "",
    addToAllStores: false
  });

  const addCategoryValue = "__add_new_category__";
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [showDailyPostModal, setShowDailyPostModal] = useState(false);
  const [dailyPostStep, setDailyPostStep] = useState("setup");
  const [dailyPostStoreId, setDailyPostStoreId] = useState("");
  const [dailyPostCategory, setDailyPostCategory] = useState("");
  const [dailyPostCategories, setDailyPostCategories] = useState([]);
  const [loadingDailyPostCategories, setLoadingDailyPostCategories] = useState(false);
  const [dailyPostInventoryItems, setDailyPostInventoryItems] = useState([]);
  const [dailyPostInitialCounts, setDailyPostInitialCounts] = useState({});
  const [dailyPostDraftCounts, setDailyPostDraftCounts] = useState({});
  const [dailyPostCurrentIndex, setDailyPostCurrentIndex] = useState(0);
  const [loadingDailyPostItems, setLoadingDailyPostItems] = useState(false);
  const [submittingDailyPost, setSubmittingDailyPost] = useState(false);
  const [postFeed, setPostFeed] = useState([]);
  const [loadingPostFeed, setLoadingPostFeed] = useState(false);
  const [postFeedDateFrom, setPostFeedDateFrom] = useState("");
  const [postFeedDateTo, setPostFeedDateTo] = useState("");
  const [storeForm, setStoreForm] = useState({
    name: "",
    officeNumber: "",
    phone: "",
    address: ""
  });
  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  const isAuthenticated = Boolean(token && currentUser);
  const isManager = currentUser?.role === "Manager";

  const tabHeading = useMemo(() => {
    const item = navItems.find((entry) => entry.key === activeTab);
    return item?.label || "Overview";
  }, [activeTab]);

  const filteredStores = useMemo(() => {
    const query = storeSearch.trim().toLowerCase();
    if (!query) {
      return stores;
    }

    return stores.filter((store) => {
      const searchable = [store.name, store.officeNumber, store.phone, store.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [storeSearch, stores]);

  const allInventoryCategories = useMemo(() => {
    const set = new Set(cumulativeInventory.map((item) => item.inventoryCategory).filter(Boolean));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [cumulativeInventory]);

  const filteredCumulativeInventory = useMemo(() => {
    const base =
      allInventoryCategory === "All"
        ? cumulativeInventory
        : cumulativeInventory.filter((item) => item.inventoryCategory === allInventoryCategory);

    return [...base].sort((a, b) => String(a.inventoryName).localeCompare(String(b.inventoryName)));
  }, [allInventoryCategory, cumulativeInventory]);

  const overviewScopedInventoryRows = useMemo(() => {
    const rows = cumulativeInventory.map((item) => {
      const preferredCount = Number(item.cumulativePreferredCount || 0);
      const visibleCount =
        overviewSelectedStoreId === "all"
          ? Number(item.cumulativeCount || 0)
          : Number(item.countsByStore?.[String(overviewSelectedStoreId)] || 0);
      const shortage = Math.max(preferredCount - visibleCount, 0);
      return {
        inventoryName: item.inventoryName,
        inventoryCategory: item.inventoryCategory,
        visibleCount,
        preferredCount,
        shortage,
        status: shortage > 0 ? "Needs attention" : "Healthy"
      };
    });

    return rows.sort((a, b) => {
      if (b.shortage !== a.shortage) {
        return b.shortage - a.shortage;
      }
      return String(a.inventoryName).localeCompare(String(b.inventoryName));
    });
  }, [cumulativeInventory, overviewSelectedStoreId]);

  const overviewInventoryRows = useMemo(() => {
    const filtered =
      overviewStockView === "attention"
        ? overviewScopedInventoryRows.filter((item) => item.shortage > 0)
        : overviewScopedInventoryRows;

    return filtered;
  }, [overviewScopedInventoryRows, overviewStockView]);

  const overviewActivityRows = useMemo(() => {
    const now = Date.now();
    const rangeInMs =
      overviewTimeRange === "24h"
        ? 24 * 60 * 60 * 1000
        : overviewTimeRange === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : overviewTimeRange === "30d"
            ? 30 * 24 * 60 * 60 * 1000
            : Number.POSITIVE_INFINITY;

    return postFeed
      .filter((post) => {
        if (overviewSelectedStoreId !== "all" && String(post.storeId) !== String(overviewSelectedStoreId)) {
          return false;
        }
        if (overviewFeedFilter === "mine" && Number(post.postedByUserId) !== Number(currentUser?.id)) {
          return false;
        }
        const postedAtMs = new Date(post.postedAt).getTime();
        if (!Number.isFinite(postedAtMs)) {
          return false;
        }
        return now - postedAtMs <= rangeInMs;
      })
      .slice(0, 12);
  }, [postFeed, overviewSelectedStoreId, overviewFeedFilter, overviewTimeRange, currentUser]);

  const overviewMetrics = useMemo(() => {
    const visibleStoreIds =
      overviewSelectedStoreId === "all"
        ? stores.map((store) => String(store.id))
        : [String(overviewSelectedStoreId)];

    const totalUnits = cumulativeInventory.reduce((sum, item) => {
      if (overviewSelectedStoreId === "all") {
        return sum + Number(item.cumulativeCount || 0);
      }
      return sum + Number(item.countsByStore?.[String(overviewSelectedStoreId)] || 0);
    }, 0);

    const lowStockCount = cumulativeInventory.reduce((sum, item) => {
      const visibleCount =
        overviewSelectedStoreId === "all"
          ? Number(item.cumulativeCount || 0)
          : Number(item.countsByStore?.[String(overviewSelectedStoreId)] || 0);
      return visibleCount < Number(item.cumulativePreferredCount || 0) ? sum + 1 : sum;
    }, 0);

    const activePeople = new Set(
      overviewActivityRows
        .map((post) => post.postedByUserId)
        .filter((id) => id !== null && id !== undefined)
        .map((id) => String(id))
    );

    return {
      storeCount: visibleStoreIds.length,
      totalUnits,
      lowStockCount,
      postCount: overviewActivityRows.length,
      activePeople: activePeople.size
    };
  }, [stores, cumulativeInventory, overviewSelectedStoreId, overviewActivityRows]);

  const overviewRadarData = useMemo(() => {
    const totalItems = overviewScopedInventoryRows.length;
    const attentionItems = overviewScopedInventoryRows.filter((item) => item.shortage > 0);
    const healthyItems = totalItems - attentionItems.length;
    const totalVisibleCount = overviewScopedInventoryRows.reduce((sum, item) => sum + item.visibleCount, 0);
    const totalPreferredCount = overviewScopedInventoryRows.reduce((sum, item) => sum + item.preferredCount, 0);
    const totalShortage = attentionItems.reduce((sum, item) => sum + item.shortage, 0);
    const fulfillmentRate = totalPreferredCount > 0
      ? Math.min((totalVisibleCount / totalPreferredCount) * 100, 100)
      : 100;

    const shortageTopItems = attentionItems.slice(0, 6);
    const maxShortage = shortageTopItems.reduce((max, item) => Math.max(max, item.shortage), 0);

    const shortageByCategoryMap = new Map();
    attentionItems.forEach((item) => {
      const key = item.inventoryCategory || "Uncategorized";
      shortageByCategoryMap.set(key, Number(shortageByCategoryMap.get(key) || 0) + item.shortage);
    });

    const shortageByCategory = Array.from(shortageByCategoryMap.entries())
      .map(([category, shortage]) => ({ category, shortage }))
      .sort((a, b) => b.shortage - a.shortage)
      .slice(0, 5);

    const maxCategoryShortage = shortageByCategory.reduce((max, item) => Math.max(max, item.shortage), 0);
    const healthyPercent = totalItems > 0 ? Math.round((healthyItems / totalItems) * 100) : 0;
    const attentionPercent = totalItems > 0 ? 100 - healthyPercent : 0;

    return {
      totalItems,
      attentionCount: attentionItems.length,
      healthyCount: healthyItems,
      totalVisibleCount,
      totalPreferredCount,
      totalShortage,
      fulfillmentRate,
      healthyPercent,
      attentionPercent,
      shortageTopItems,
      maxShortage,
      shortageByCategory,
      maxCategoryShortage
    };
  }, [overviewScopedInventoryRows]);

  const filteredPostFeed = useMemo(() => {
    if (!postFeedDateFrom && !postFeedDateTo) {
      return postFeed;
    }

    const fromTimestamp = postFeedDateFrom
      ? new Date(`${postFeedDateFrom}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const toTimestamp = postFeedDateTo
      ? new Date(`${postFeedDateTo}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;

    return postFeed.filter((post) => {
      const postedAtTimestamp = new Date(post.postedAt).getTime();
      return Number.isFinite(postedAtTimestamp) && postedAtTimestamp >= fromTimestamp && postedAtTimestamp <= toTimestamp;
    });
  }, [postFeed, postFeedDateFrom, postFeedDateTo]);

  const storeInventoryCategories = useMemo(() => {
    const values = new Set(
      storeInventory
        .map((item) => String(item.inventoryCategory || "").trim())
        .filter(Boolean)
    );
    return ["All", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [storeInventory]);

  const filteredStoreInventory = useMemo(() => {
    const query = storeInventorySearch.trim().toLowerCase();
    return storeInventory
      .filter((item) => {
        if (storeInventoryCategoryFilter !== "All" && item.inventoryCategory !== storeInventoryCategoryFilter) {
          return false;
        }

        const count = Number(item.inventoryCount || 0);
        const preferred = Number(item.preferredCount || 0);
        const shortage = Math.max(preferred - count, 0);

        if (storeInventoryHealthFilter === "attention" && shortage === 0) {
          return false;
        }

        if (storeInventoryHealthFilter === "healthy" && shortage > 0) {
          return false;
        }

        if (!query) {
          return true;
        }

        const searchable = [item.inventoryName, item.inventoryCategory].filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(query);
      })
      .sort((a, b) => {
        const shortageA = Math.max(Number(a.preferredCount || 0) - Number(a.inventoryCount || 0), 0);
        const shortageB = Math.max(Number(b.preferredCount || 0) - Number(b.inventoryCount || 0), 0);
        if (shortageB !== shortageA) {
          return shortageB - shortageA;
        }
        return String(a.inventoryName || "").localeCompare(String(b.inventoryName || ""));
      });
  }, [storeInventory, storeInventorySearch, storeInventoryCategoryFilter, storeInventoryHealthFilter]);

  const hasDailyPostDraftChanges = useMemo(() => {
    if (dailyPostInventoryItems.length === 0) {
      return false;
    }

    return dailyPostInventoryItems.some((item) => {
      const itemId = String(item.id);
      const initialValue = Number(dailyPostInitialCounts[itemId] ?? item.inventoryCount ?? 0);
      const draftValue = Number(dailyPostDraftCounts[itemId] ?? item.inventoryCount ?? 0);
      return initialValue !== draftValue;
    });
  }, [dailyPostInventoryItems, dailyPostInitialCounts, dailyPostDraftCounts]);

  const dailyPostStoreLabel = useMemo(() => {
    if (!dailyPostStoreId) {
      return "No location selected";
    }

    const store = stores.find((entry) => String(entry.id) === String(dailyPostStoreId));
    return store ? `${store.name} #${store.officeNumber}` : "Selected location";
  }, [dailyPostStoreId, stores]);

  const api = useMemo(
    () =>
      axios.create({
        baseURL: apiBaseUrl,
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }),
    [token]
  );

  useEffect(() => {
    if (!isAuthenticated || !apiBaseUrl) {
      return;
    }

    api
      .get("/api/me")
      .then((response) => {
        setCurrentUser(response.data.user);
        localStorage.setItem(userKey, JSON.stringify(response.data.user));
      })
      .catch(() => {
        onSignOut(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, apiBaseUrl]);

  useEffect(() => {
    if (!isAuthenticated || (activeTab !== "overview" && activeTab !== "stores" && activeTab !== "posts")) {
      return;
    }

    void loadStores();
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    if (!isAuthenticated || activeTab !== "account" || !isManager) {
      return;
    }

    void loadEmployees();
  }, [isAuthenticated, activeTab, isManager]);

  useEffect(() => {
    if (!isAuthenticated || activeTab !== "posts") {
      return;
    }

    void loadPostFeed("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    if (!isAuthenticated || activeTab !== "overview") {
      return;
    }

    void Promise.all([
      loadCumulativeInventory(),
      loadPostFeed(""),
      isManager ? loadEmployees() : Promise.resolve()
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab, isManager]);

  useEffect(() => {
    if (overviewSelectedStoreId === "all") {
      return;
    }

    const exists = stores.some((store) => String(store.id) === String(overviewSelectedStoreId));
    if (!exists) {
      setOverviewSelectedStoreId("all");
    }
  }, [stores, overviewSelectedStoreId]);

  useEffect(() => {
    if (!isAuthenticated || activeTab !== "stores" || !selectedStore || storeView !== "all-inventory") {
      return;
    }

    void Promise.all([loadCumulativeInventory(), loadInventoryCategories()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab, selectedStore, storeView]);

  const onAuthFormChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((prev) => ({ ...prev, [name]: value }));
  };

  const onStoreFormChange = (event) => {
    const { name, value } = event.target;
    setStoreForm((prev) => ({ ...prev, [name]: value }));
  };

  const onInventoryFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setInventoryForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const onEmployeeFormChange = (event) => {
    const { name, value } = event.target;
    setEmployeeForm((prev) => ({ ...prev, [name]: value }));
  };

  const onAuthSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!apiBaseUrl) {
      setMessage("Set VITE_API_BASE_URL in your frontend environment.");
      return;
    }

    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const payload =
        mode === "signup"
          ? {
              name: authForm.name,
              email: authForm.email,
              password: authForm.password
            }
          : {
              email: authForm.email,
              password: authForm.password
            };

      const response = await axios.post(`${apiBaseUrl}${endpoint}`, payload);
      const user = response.data.user;
      setToken(response.data.token);
      setCurrentUser(user);
      localStorage.setItem(tokenKey, response.data.token);
      localStorage.setItem(userKey, JSON.stringify(user));
      setActiveTab("overview");
      setMode("login");
      setAuthForm({ name: "", email: "", password: "" });
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Something went wrong.");
    }
  };

  const onSignOut = (showMessage = true) => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    setToken("");
    setCurrentUser(null);
    setStores([]);
    setStoreSearch("");
    setOverviewSelectedStoreId("all");
    setOverviewFeedFilter("all");
    setOverviewTimeRange("7d");
    setOverviewStockView("attention");
    setSelectedStore(null);
    setStoreView("detail");
    setAllInventoryCategory("All");
    setCumulativeInventory([]);
    setCumulativeStores([]);
    setSelectedCumulativeStoreIds([]);
    setEditingInventoryKey("");
    setStoreInventory([]);
    setStoreInventorySearch("");
    setStoreInventoryCategoryFilter("All");
    setStoreInventoryHealthFilter("all");
    setInventoryCategories([]);
    setShowInventoryForm(false);
    setShowDailyPostModal(false);
    setDailyPostStep("setup");
    setDailyPostStoreId("");
    setDailyPostCategory("");
    setDailyPostCategories([]);
    setDailyPostInventoryItems([]);
    setDailyPostInitialCounts({});
    setDailyPostDraftCounts({});
    setDailyPostCurrentIndex(0);
    setPostFeed([]);
    setPostFeedDateFrom("");
    setPostFeedDateTo("");
    setEmployees([]);
    setActiveTab("overview");
    if (showMessage) {
      setMessage("Signed out successfully.");
    }
  };

  const loadStores = async () => {
    setLoadingStores(true);
    try {
      const response = await api.get("/api/stores");
      setStores(response.data.stores || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch stores/offices.");
    } finally {
      setLoadingStores(false);
    }
  };

  const loadEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const response = await api.get("/api/employees");
      setEmployees(response.data.employees || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch employees.");
    } finally {
      setLoadingEmployees(false);
    }
  };

  const onCreateStore = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      const response = await api.post("/api/stores", storeForm);
      setStores((prev) => [response.data.store, ...prev]);
      setStoreForm({ name: "", officeNumber: "", phone: "", address: "" });
      setShowStoreForm(false);
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not add store/office.");
    }
  };

  const onAddEmployee = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      const response = await api.post("/api/employees", employeeForm);
      setEmployees((prev) => [response.data.employee, ...prev]);
      setEmployeeForm({ name: "", email: "", password: "" });
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not add employee.");
    }
  };

  const loadStoreInventory = async (storeId) => {
    setLoadingStoreInventory(true);
    try {
      const response = await api.get(`/api/stores/${storeId}/inventory`);
      setStoreInventory(response.data.inventory || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch store inventory.");
    } finally {
      setLoadingStoreInventory(false);
    }
  };

  const loadInventoryCategories = async () => {
    setLoadingInventoryCategories(true);
    try {
      const response = await api.get("/api/inventory-categories");
      setInventoryCategories(response.data.categories || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch inventory categories.");
    } finally {
      setLoadingInventoryCategories(false);
    }
  };

  const loadCumulativeInventory = async () => {
    setLoadingCumulativeInventory(true);
    try {
      const response = await api.get("/api/inventory/cumulative");
      setCumulativeStores(response.data.stores || []);
      setCumulativeInventory(response.data.items || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch cumulative inventory.");
    } finally {
      setLoadingCumulativeInventory(false);
    }
  };

  const onStartEditInventory = (item) => {
    const key = `${item.inventoryCategory}::${item.inventoryName}`;
    setEditingInventoryKey(key);
    setEditInventoryForm({
      inventoryCategory: item.inventoryCategory,
      inventoryName: item.inventoryName,
      preferredCount: String(item.cumulativePreferredCount)
    });
  };

  const onEditInventoryFormChange = (event) => {
    const { name, value } = event.target;
    setEditInventoryForm((prev) => ({ ...prev, [name]: value }));
  };

  const loadDailyPostCategories = async (storeId) => {
    if (!storeId) {
      setDailyPostCategories([]);
      return;
    }

    setLoadingDailyPostCategories(true);
    try {
      const response = await api.get(`/api/stores/${storeId}/inventory/categories`);
      setDailyPostCategories(response.data.categories || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch store categories.");
    } finally {
      setLoadingDailyPostCategories(false);
    }
  };

  const loadPostFeed = async (storeId) => {
    setLoadingPostFeed(true);
    try {
      const response = storeId
        ? await api.get(`/api/stores/${storeId}/inventory/posts?all=true`)
        : await api.get("/api/inventory/posts?all=true");
      setPostFeed(response.data.posts || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch inventory post feed.");
    } finally {
      setLoadingPostFeed(false);
    }
  };

  const resetDailyPostComposer = () => {
    setDailyPostStep("setup");
    setDailyPostStoreId("");
    setDailyPostCategory("");
    setDailyPostCategories([]);
    setDailyPostInventoryItems([]);
    setDailyPostInitialCounts({});
    setDailyPostDraftCounts({});
    setDailyPostCurrentIndex(0);
    setLoadingDailyPostItems(false);
    setSubmittingDailyPost(false);
  };

  const onOpenDailyPostModal = () => {
    resetDailyPostComposer();
    setShowDailyPostModal(true);
  };

  const onCloseDailyPostModal = () => {
    if (hasDailyPostDraftChanges) {
      const confirmed = window.confirm("Close daily post and discard current entries?");
      if (!confirmed) {
        return;
      }
    }

    setShowDailyPostModal(false);
    resetDailyPostComposer();
  };

  const onDailyPostStoreChange = async (event) => {
    const nextStoreId = event.target.value;

    if (nextStoreId === dailyPostStoreId) {
      return;
    }

    if (dailyPostInventoryItems.length > 0 || hasDailyPostDraftChanges || dailyPostStep !== "setup") {
      const confirmed = window.confirm(
        "Changing location will clear all current entries. Continue?"
      );
      if (!confirmed) {
        return;
      }
    }

    setDailyPostStoreId(nextStoreId);
    setDailyPostCategory("");
    setDailyPostInventoryItems([]);
    setDailyPostInitialCounts({});
    setDailyPostDraftCounts({});
    setDailyPostCurrentIndex(0);
    setDailyPostStep("setup");
    await loadDailyPostCategories(nextStoreId);
  };

  const onStartDailyPostFlow = async () => {
    if (!dailyPostStoreId) {
      setMessage("Select a location to begin daily posting.");
      return;
    }

    if (!dailyPostCategory) {
      setMessage("Select a manager-defined inventory category.");
      return;
    }

    setLoadingDailyPostItems(true);
    try {
      const response = await api.get(
        `/api/stores/${dailyPostStoreId}/inventory?category=${encodeURIComponent(dailyPostCategory)}`
      );
      const items = response.data.inventory || [];

      if (items.length === 0) {
        setMessage("No inventory items found for this category.");
        setDailyPostInventoryItems([]);
        return;
      }

      const initialCounts = {};
      const draftCounts = {};

      items.forEach((item) => {
        const key = String(item.id);
        const count = Number(item.inventoryCount || 0);
        initialCounts[key] = count;
        draftCounts[key] = String(count);
      });

      setDailyPostInventoryItems(items);
      setDailyPostInitialCounts(initialCounts);
      setDailyPostDraftCounts(draftCounts);
      setDailyPostCurrentIndex(0);
      setDailyPostStep("entry");
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not start daily posting flow.");
    } finally {
      setLoadingDailyPostItems(false);
    }
  };

  const onDailyPostCountChange = (itemId, value) => {
    setDailyPostDraftCounts((prev) => ({
      ...prev,
      [String(itemId)]: value
    }));
  };

  const onDailyPostNext = () => {
    const currentItem = dailyPostInventoryItems[dailyPostCurrentIndex];
    if (!currentItem) {
      return;
    }

    const draftValue = dailyPostDraftCounts[String(currentItem.id)] ?? "0";
    if (Number.isNaN(Number(draftValue))) {
      setMessage("Inventory count must be a valid number.");
      return;
    }

    const nextIndex = dailyPostCurrentIndex + 1;
    if (nextIndex >= dailyPostInventoryItems.length) {
      setDailyPostStep("verify");
      return;
    }

    setDailyPostCurrentIndex(nextIndex);
  };

  const onSubmitDailyPost = async () => {
    if (!dailyPostStoreId || dailyPostInventoryItems.length === 0) {
      setMessage("No daily post entries to submit.");
      return;
    }

    for (const item of dailyPostInventoryItems) {
      const value = dailyPostDraftCounts[String(item.id)] ?? "0";
      if (Number.isNaN(Number(value))) {
        setMessage(`Invalid number for ${item.inventoryName}.`);
        return;
      }
    }

    setSubmittingDailyPost(true);
    try {
      await Promise.all(
        dailyPostInventoryItems.map((item) =>
          api.patch(`/api/stores/${dailyPostStoreId}/inventory/${item.id}/count`, {
            inventoryCount: Number(dailyPostDraftCounts[String(item.id)] ?? 0)
          })
        )
      );

      await loadPostFeed("");
      setMessage("Inventory Daily Post submitted successfully.");
      setShowDailyPostModal(false);
      resetDailyPostComposer();
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not submit daily post.");
    } finally {
      setSubmittingDailyPost(false);
    }
  };

  const onSaveEditInventory = async (item) => {
    try {
      const payload = {
        inventoryCategory: item.inventoryCategory,
        inventoryName: item.inventoryName,
        newInventoryCategory: editInventoryForm.inventoryCategory,
        newInventoryName: editInventoryForm.inventoryName,
        preferredCount: Number(editInventoryForm.preferredCount)
      };
      const response = await api.patch("/api/inventory/cumulative", payload);
      setMessage(response.data.message);
      setEditingInventoryKey("");
      await Promise.all([loadCumulativeInventory(), loadInventoryCategories()]);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not update inventory.");
    }
  };

  const onAddInventory = async (event) => {
    event.preventDefault();
    if (!selectedStore) {
      return;
    }

    setMessage("");

    try {
      const selectedCategory =
        inventoryForm.inventoryCategory === addCategoryValue
          ? inventoryForm.newInventoryCategory
          : inventoryForm.inventoryCategory;

      const payload = {
        inventoryCategory: selectedCategory,
        inventoryName: inventoryForm.inventoryName,
        inventoryCount:
          inventoryForm.inventoryCount === "" ? null : Number(inventoryForm.inventoryCount),
        preferredCount: Number(inventoryForm.preferredCount),
        addToAllStores: Boolean(inventoryForm.addToAllStores)
      };
      const response = await api.post(`/api/stores/${selectedStore.id}/inventory`, payload);
      setStoreInventory((prev) => [response.data.item, ...prev]);
      setInventoryForm({
        inventoryCategory: "",
        newInventoryCategory: "",
        inventoryName: "",
        inventoryCount: "",
        preferredCount: "",
        addToAllStores: false
      });
      await loadInventoryCategories();
      setShowInventoryForm(false);
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not add inventory item.");
    }
  };

  const onNavigateTab = (tabKey) => {
    if (tabKey === "overview") {
      setShowStoreForm(false);
    }

    if (tabKey === "stores") {
      setSelectedStore(null);
      setStoreView("detail");
      setStoreInventory([]);
      setShowInventoryForm(false);
      setStoreSearch("");
      setSelectedCumulativeStoreIds([]);
    }

    if (tabKey === "posts") {
      setShowDailyPostModal(false);
      resetDailyPostComposer();
    }

    if (tabKey === "account") {
      setEmployeeForm({ name: "", email: "", password: "" });
    }

    setActiveTab(tabKey);
  };

  const renderOverview = () => {
    const selectedStoreName =
      overviewSelectedStoreId === "all"
        ? "All stores"
        : stores.find((store) => String(store.id) === String(overviewSelectedStoreId))?.name || "Selected store";

    const roleLabel = isManager ? "Manager" : "Employee";

    return (
      <section className="dashboard-content">
        <div className="section-row">
          <div>
            <p className="section-title icon-text"><UIIcon name="overview" />Unified Overview</p>
            <p className="section-sub">{roleLabel} workspace at a glance.</p>
          </div>
          <div className="table-actions">
            <button type="button" className="action-btn" onClick={() => onNavigateTab("posts")}>
              <UIIcon name="posts" />
              Open Posts
            </button>
            <button type="button" className="signout-btn" onClick={() => onNavigateTab("stores")}>
              <UIIcon name="stores" />
              Open Stores
            </button>
          </div>
        </div>

        <div className="overview-kpi-grid">
          <article className="overview-kpi-card">
            <p className="tiny icon-text"><UIIcon name="filter" />Scope</p>
            <h3>{selectedStoreName}</h3>
            <p className="section-sub">{overviewMetrics.storeCount} location(s) in view</p>
          </article>
          <article className="overview-kpi-card">
            <p className="tiny icon-text"><UIIcon name="inventory" />Inventory Units</p>
            <h3>{overviewMetrics.totalUnits}</h3>
            <p className="section-sub">Current on-hand quantity</p>
          </article>
          <article className="overview-kpi-card">
            <p className="tiny icon-text"><UIIcon name="warning" />Low Stock Items</p>
            <h3>{overviewMetrics.lowStockCount}</h3>
            <p className="section-sub">Items under preferred threshold</p>
          </article>
          <article className="overview-kpi-card">
            <p className="tiny icon-text"><UIIcon name="activity" />Recent Posts</p>
            <h3>{overviewMetrics.postCount}</h3>
            <p className="section-sub">{overviewMetrics.activePeople} active contributor(s)</p>
          </article>
        </div>

        <div className="section-block">
          <div className="overview-filter-grid">
            <label>
              <span className="icon-text"><UIIcon name="stores" />Store Scope</span>
              <select
                value={overviewSelectedStoreId}
                onChange={(event) => setOverviewSelectedStoreId(event.target.value)}
              >
                <option value="all">All stores</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name} #{store.officeNumber}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="icon-text"><UIIcon name="clock" />Time Range</span>
              <select value={overviewTimeRange} onChange={(event) => setOverviewTimeRange(event.target.value)}>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All time</option>
              </select>
            </label>

            <label>
              <span className="icon-text"><UIIcon name="activity" />Activity Scope</span>
              <select value={overviewFeedFilter} onChange={(event) => setOverviewFeedFilter(event.target.value)}>
                <option value="all">Everyone</option>
                <option value="mine">My updates</option>
              </select>
            </label>

            <label>
              <span className="icon-text"><UIIcon name="chart" />Stock View</span>
              <select value={overviewStockView} onChange={(event) => setOverviewStockView(event.target.value)}>
                <option value="attention">Needs attention</option>
                <option value="all">All items</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overview-layout-grid">
          <section className="section-block">
            <div className="section-row">
              <div>
                <p className="section-title icon-text"><UIIcon name="chart" />Stock Health Radar</p>
                <p className="section-sub">Visual stock distribution and shortage hotspots.</p>
              </div>
            </div>

            {loadingCumulativeInventory && <p>Loading inventory analytics...</p>}

            {!loadingCumulativeInventory && overviewInventoryRows.length === 0 && (
              <article className="empty-state-card">
                <h3>No inventory signals</h3>
                <p>Everything looks healthy for this scope and filter.</p>
              </article>
            )}

            {!loadingCumulativeInventory && overviewInventoryRows.length > 0 && (
              <div className="radar-grid">
                <article className="radar-panel radar-donut-panel">
                  <div className="radar-donut-wrap">
                    <div
                      className="radar-donut"
                      style={{
                        background: `conic-gradient(#2f8f95 0 ${overviewRadarData.healthyPercent}%, #ca5d74 ${overviewRadarData.healthyPercent}% 100%)`
                      }}
                      aria-label="Stock health distribution"
                    >
                      <div className="radar-donut-hole">
                        <strong>{overviewRadarData.fulfillmentRate.toFixed(0)}%</strong>
                        <span>Fulfilled</span>
                      </div>
                    </div>
                    <div className="radar-legend">
                      <p><span className="legend-dot healthy" />Healthy: {overviewRadarData.healthyCount} ({overviewRadarData.healthyPercent}%)</p>
                      <p><span className="legend-dot attention" />Attention: {overviewRadarData.attentionCount} ({overviewRadarData.attentionPercent}%)</p>
                    </div>
                  </div>

                  <div className="radar-mini-kpis">
                    <div>
                      <p className="tiny">Tracked Items</p>
                      <h3>{overviewRadarData.totalItems.toLocaleString()}</h3>
                    </div>
                    <div>
                      <p className="tiny">Total Units</p>
                      <h3>{overviewRadarData.totalVisibleCount.toLocaleString()}</h3>
                    </div>
                    <div>
                      <p className="tiny">Preferred Units</p>
                      <h3>{overviewRadarData.totalPreferredCount.toLocaleString()}</h3>
                    </div>
                    <div>
                      <p className="tiny">Shortage Units</p>
                      <h3>{overviewRadarData.totalShortage.toLocaleString()}</h3>
                    </div>
                  </div>
                </article>

                <article className="radar-panel">
                  <div className="section-row compact">
                    <p className="section-title icon-text"><UIIcon name="warning" />Top Shortages</p>
                    <span className="tiny">Highest gap items</span>
                  </div>
                  {overviewRadarData.shortageTopItems.length === 0 && <p className="tiny">No shortages in this scope.</p>}
                  {overviewRadarData.shortageTopItems.length > 0 && (
                    <div className="radar-bars">
                      {overviewRadarData.shortageTopItems.map((item) => {
                        const width = overviewRadarData.maxShortage > 0
                          ? Math.max((item.shortage / overviewRadarData.maxShortage) * 100, 6)
                          : 0;
                        return (
                          <div key={`${item.inventoryCategory}:${item.inventoryName}`} className="radar-bar-row">
                            <div className="radar-bar-labels">
                              <span>{item.inventoryName}</span>
                              <strong>{item.shortage}</strong>
                            </div>
                            <div className="radar-bar-track">
                              <span className="radar-bar-fill" style={{ width: `${width}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article className="radar-panel">
                  <div className="section-row compact">
                    <p className="section-title icon-text"><UIIcon name="tag" />Category Gap Mix</p>
                    <span className="tiny">Shortage by category</span>
                  </div>
                  {overviewRadarData.shortageByCategory.length === 0 && <p className="tiny">No category shortages.</p>}
                  {overviewRadarData.shortageByCategory.length > 0 && (
                    <div className="radar-bars category">
                      {overviewRadarData.shortageByCategory.map((entry) => {
                        const width = overviewRadarData.maxCategoryShortage > 0
                          ? Math.max((entry.shortage / overviewRadarData.maxCategoryShortage) * 100, 10)
                          : 0;
                        return (
                          <div key={entry.category} className="radar-bar-row">
                            <div className="radar-bar-labels">
                              <span>{entry.category}</span>
                              <strong>{entry.shortage}</strong>
                            </div>
                            <div className="radar-bar-track">
                              <span className="radar-bar-fill category" style={{ width: `${width}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <div className="radar-insight-list" aria-label="Stock health item details">
                  {overviewInventoryRows.slice(0, 8).map((item) => (
                    <article key={`${item.inventoryCategory}:${item.inventoryName}`} className="radar-insight-card">
                      <div className="radar-insight-head">
                        <div>
                          <p className="radar-item-name">{item.inventoryName}</p>
                          <p className="radar-item-category">{item.inventoryCategory}</p>
                        </div>
                        <span className={item.shortage > 0 ? "status-chip danger" : "status-chip good"}>
                          {item.status}
                        </span>
                      </div>

                      <div className="radar-item-metrics">
                        <div>
                          <p className="tiny">Count</p>
                          <strong>{item.visibleCount}</strong>
                        </div>
                        <div>
                          <p className="tiny">Preferred</p>
                          <strong>{item.preferredCount}</strong>
                        </div>
                        <div>
                          <p className="tiny">Gap</p>
                          <strong>{item.shortage}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="section-block">
            <div className="section-row">
              <div>
                <p className="section-title icon-text"><UIIcon name="activity" />Activity Timeline</p>
                <p className="section-sub">Latest updates.</p>
              </div>
            </div>

            {loadingPostFeed && <p>Loading recent activity...</p>}

            {!loadingPostFeed && overviewActivityRows.length === 0 && (
              <article className="empty-state-card">
                <h3>No activity found</h3>
                <p>Try a wider time range or switch to all stores.</p>
              </article>
            )}

            {!loadingPostFeed && overviewActivityRows.length > 0 && (
              <ul className="feed-list compact">
                {overviewActivityRows.map((post) => {
                  const postedAt = new Date(post.postedAt);
                  const isMine = Number(post.postedByUserId) === Number(currentUser?.id);
                  return (
                    <li key={post.id} className={isMine ? "feed-item mine" : "feed-item"}>
                      <div className="feed-head">
                        <strong>{post.postedByName || post.postedByEmail || "User"}</strong>
                        <span>{postedAt.toLocaleDateString()} at {postedAt.toLocaleTimeString()}</span>
                      </div>
                      <p className="feed-location">{post.storeName} #{post.storeOfficeNumber}</p>
                      <div className="feed-line">
                        <span>{post.inventoryName}</span>
                        <strong><UIIcon name="inventory" />{post.postedCount}</strong>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="section-block">
          <div className="section-row">
            <div>
              <p className="section-title icon-text"><UIIcon name="plus" />Quick Workspace Actions</p>
              <p className="section-sub">Jump to key actions.</p>
            </div>
            {isManager && (
              <button type="button" className="action-btn" onClick={() => setShowStoreForm((prev) => !prev)}>
                <UIIcon name="plus" />
                {showStoreForm ? "Hide Office Form" : "Add Office"}
              </button>
            )}
          </div>

          <div className="table-actions">
            <button type="button" className="action-btn" onClick={() => onNavigateTab("stores")}><UIIcon name="stores" />Manage Stores</button>
            <button type="button" className="action-btn" onClick={() => onNavigateTab("posts")}><UIIcon name="posts" />Post Inventory</button>
            <button type="button" className="signout-btn" onClick={() => onNavigateTab("account")}><UIIcon name="account" />Account</button>
          </div>

          {isManager && showStoreForm && (
            <form className="grid-form" onSubmit={onCreateStore}>
              <label>
                Name of office
                <input name="name" value={storeForm.name} onChange={onStoreFormChange} required />
              </label>
              <label>
                Office number
                <input name="officeNumber" value={storeForm.officeNumber} onChange={onStoreFormChange} required />
              </label>
              <label>
                Phone number for office
                <input name="phone" value={storeForm.phone} onChange={onStoreFormChange} required />
              </label>
              <label>
                Address of office
                <input name="address" value={storeForm.address} onChange={onStoreFormChange} required />
              </label>
              <button type="submit" className="submit-btn">Save Office / Store</button>
            </form>
          )}

          {isManager && (
            <p className="tiny">Team members: {employees.length} {employees.length === 1 ? "employee" : "employees"}</p>
          )}
        </section>
      </section>
    );
  };

  const toggleCumulativeStoreSelection = (storeId) => {
    setSelectedCumulativeStoreIds((prev) => {
      const key = String(storeId);
      return prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key];
    });
  };

  const setAllCumulativeStoresSelected = (storeColumns) => {
    setSelectedCumulativeStoreIds(storeColumns.map((store) => String(store.id)));
  };

  const renderStores = () => {
    if (selectedStore) {
      if (storeView === "all-inventory") {
        const storeColumns = cumulativeStores.length > 0 ? cumulativeStores : stores;
        const selectedSet = new Set(selectedCumulativeStoreIds);
        const candidateVisibleStoreColumns =
          selectedCumulativeStoreIds.length === 0
            ? storeColumns
            : storeColumns.filter((store) => selectedSet.has(String(store.id)));
        const visibleStoreColumns =
          candidateVisibleStoreColumns.length > 0 ? candidateVisibleStoreColumns : storeColumns;
        const selectedStoresLabel =
          visibleStoreColumns.length === storeColumns.length
            ? "All stores selected"
            : `${visibleStoreColumns.length} store(s) selected`;

        return (
          <section className="dashboard-content">
            <div className="section-row">
              <div>
                <p className="section-title icon-text"><UIIcon name="inventory" />All Inventory</p>
                <p className="section-sub">Cumulative inventory for your accessible stores.</p>
              </div>
              <button type="button" className="signout-btn" onClick={() => setStoreView("detail")}>
                Back to Store
              </button>
            </div>

            <details className="store-filter-dropdown">
              <summary>{selectedStoresLabel}</summary>
              <div className="store-filter-panel">
                <div className="table-actions">
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => setAllCumulativeStoresSelected(storeColumns)}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="signout-btn"
                    onClick={() => setSelectedCumulativeStoreIds([])}
                  >
                    Show All
                  </button>
                </div>

                <div className="store-filter-list">
                  {storeColumns.map((store) => {
                    const checked =
                      selectedCumulativeStoreIds.length === 0 ||
                      selectedCumulativeStoreIds.includes(String(store.id));
                    return (
                      <label key={store.id} className="store-filter-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCumulativeStoreSelection(store.id)}
                        />
                        <span>{store.name} #{store.officeNumber}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>

            <div className="category-tabs" role="tablist" aria-label="Inventory categories">
              {allInventoryCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={allInventoryCategory === category ? "category-tab active" : "category-tab"}
                  onClick={() => setAllInventoryCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            {loadingCumulativeInventory && <p>Loading inventory...</p>}

            {!loadingCumulativeInventory && filteredCumulativeInventory.length === 0 && (
              <article className="empty-state-card">
                <h3>No inventory found</h3>
                <p>There are no inventory items in this category yet.</p>
              </article>
            )}

            {!loadingCumulativeInventory && filteredCumulativeInventory.length > 0 && (
              <div className="table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Inventory Name</th>
                      {visibleStoreColumns.map((store) => (
                        <th key={store.id}>{store.name} #{store.officeNumber}</th>
                      ))}
                      <th>Cumulative</th>
                      {isManager && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCumulativeInventory.map((item) => {
                      const rowKey = `${item.inventoryCategory}::${item.inventoryName}`;
                      const isEditing = editingInventoryKey === rowKey;
                      return (
                        <tr key={rowKey}>
                          <td>
                            {isEditing ? (
                              <input
                                name="inventoryName"
                                value={editInventoryForm.inventoryName}
                                onChange={onEditInventoryFormChange}
                              />
                            ) : (
                              item.inventoryName
                            )}
                          </td>
                          {visibleStoreColumns.map((store) => {
                            const count = Number(item.countsByStore?.[String(store.id)] ?? 0);
                            return <td key={store.id}>{count}</td>;
                          })}
                          <td>
                            {Number(item.cumulativeCount || 0)}
                          </td>
                          {isManager && (
                            <td>
                              {isEditing ? (
                                <div className="table-actions">
                                  <button type="button" className="action-btn" onClick={() => onSaveEditInventory(item)}>
                                    Save
                                  </button>
                                  <button type="button" className="signout-btn" onClick={() => setEditingInventoryKey("")}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button type="button" className="action-btn" onClick={() => onStartEditInventory(item)}>
                                  Edit
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      }

      if (storeView === "inventory") {
        return (
          <section className="dashboard-content">
            <div className="section-row">
              <div>
                <p className="section-title icon-text"><UIIcon name="inventory" />Inventory: {selectedStore.name}</p>
                <p className="section-sub">Office #{selectedStore.officeNumber}</p>
              </div>
              <button type="button" className="signout-btn" onClick={() => setStoreView("detail")}>
                Back to Store
              </button>
            </div>

            <div className="section-row">
              <p className="section-sub">Need global visibility? Open cumulative All Inventory view.</p>
              <button type="button" className="action-btn" onClick={() => setStoreView("all-inventory")}>
                All Inventory
              </button>
            </div>

            {isManager && (
              <div className="section-row">
                <p className="section-sub">Manage inventory items for this store.</p>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => setShowInventoryForm((prev) => !prev)}
                >
                  {showInventoryForm ? "Close" : "Add Inventory"}
                </button>
              </div>
            )}

            {isManager && showInventoryForm && (
              <form className="grid-form" onSubmit={onAddInventory}>
                <label>
                  Inventory Category
                  <select
                    name="inventoryCategory"
                    value={inventoryForm.inventoryCategory}
                    onChange={onInventoryFormChange}
                    required
                  >
                    <option value="">Select category</option>
                    {inventoryCategories.map((category) => (
                      <option key={category.id} value={category.name}>{category.name}</option>
                    ))}
                    <option value={addCategoryValue}>+ Add new category</option>
                  </select>
                  {loadingInventoryCategories && <span className="tiny">Loading categories...</span>}
                </label>
                {inventoryForm.inventoryCategory === addCategoryValue && (
                  <label>
                    New Category Name
                    <input
                      name="newInventoryCategory"
                      value={inventoryForm.newInventoryCategory}
                      onChange={onInventoryFormChange}
                      required
                    />
                  </label>
                )}
                <label>
                  Inventory Name
                  <input
                    name="inventoryName"
                    value={inventoryForm.inventoryName}
                    onChange={onInventoryFormChange}
                    required
                  />
                </label>
                <label>
                  Inventory Count
                  <input
                    type="number"
                    name="inventoryCount"
                    value={inventoryForm.inventoryCount}
                    onChange={onInventoryFormChange}
                  />
                </label>
                <label>
                  Preferred Count
                  <input
                    type="number"
                    name="preferredCount"
                    value={inventoryForm.preferredCount}
                    onChange={onInventoryFormChange}
                    required
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    name="addToAllStores"
                    checked={inventoryForm.addToAllStores}
                    onChange={onInventoryFormChange}
                  />
                  Add this inventory to all stores
                </label>
                <button type="submit" className="submit-btn">Save Inventory Item</button>
              </form>
            )}

            {loadingStoreInventory && <p>Loading inventory...</p>}

            {!loadingStoreInventory && storeInventory.length === 0 && (
              <article className="empty-state-card">
                <h3>No inventory yet</h3>
                <p>No items exist for this store yet.</p>
              </article>
            )}

            {!loadingStoreInventory && storeInventory.length > 0 && (
              <ul className="data-list">
                {storeInventory.map((item) => (
                  <li key={item.id} className="data-item">
                    <div className="item-head">
                      <strong>{item.inventoryName}</strong>
                      <span>{item.inventoryCount}</span>
                    </div>
                    <p>Category: {item.inventoryCategory}</p>
                    <p>Preferred Count: {item.preferredCount}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      }

      return (
        <section className="dashboard-content">
          <div className="section-row">
            <div>
              <p className="section-title icon-text"><UIIcon name="building" />{selectedStore.name}</p>
              <p className="section-sub">Office #{selectedStore.officeNumber}</p>
            </div>
            <div className="table-actions">
              <button type="button" className="action-btn" onClick={() => setStoreView("all-inventory")}>
                All Inventory
              </button>
              <button type="button" className="signout-btn" onClick={() => setSelectedStore(null)}>
                Back to Stores
              </button>
            </div>
          </div>

          <article className="empty-state-card">
            <p className="tiny">Phone: {selectedStore.phone}</p>
            <p className="tiny">Address: {selectedStore.address}</p>
            {isManager && (
              <button
                type="button"
                className="action-btn"
                onClick={() => {
                  setStoreView("inventory");
                  setShowInventoryForm(false);
                    setStoreInventorySearch("");
                    setStoreInventoryCategoryFilter("All");
                    setStoreInventoryHealthFilter("all");
                  void Promise.all([loadStoreInventory(selectedStore.id), loadInventoryCategories()]);
                }}
              >
                Edit Inventory
              </button>
            )}
          </article>

          {loadingStoreInventory && <p>Loading inventory...</p>}

          {!loadingStoreInventory && storeInventory.length === 0 && (
            <article className="empty-state-card">
              <h3>No inventory yet</h3>
              <p>No items exist for this store yet.</p>
            </article>
          )}

          {!loadingStoreInventory && storeInventory.length > 0 && (
            <>
              <div className="overview-filter-grid store-inventory-filter-grid">
                <label>
                  <span className="icon-text"><UIIcon name="search" />Search Inventory</span>
                  <input
                    type="text"
                    value={storeInventorySearch}
                    onChange={(event) => setStoreInventorySearch(event.target.value)}
                    placeholder="Search item or category"
                  />
                </label>

                <label>
                  <span className="icon-text"><UIIcon name="tag" />Category</span>
                  <select
                    value={storeInventoryCategoryFilter}
                    onChange={(event) => setStoreInventoryCategoryFilter(event.target.value)}
                  >
                    {storeInventoryCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="icon-text"><UIIcon name="check" />Health</span>
                  <select
                    value={storeInventoryHealthFilter}
                    onChange={(event) => setStoreInventoryHealthFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="attention">Needs attention</option>
                    <option value="healthy">Healthy</option>
                  </select>
                </label>
              </div>

              <p className="tiny">Showing {filteredStoreInventory.length} of {storeInventory.length} items</p>

              {filteredStoreInventory.length === 0 && (
                <article className="empty-state-card">
                  <h3>No matching inventory</h3>
                  <p>Try adjusting search or filters.</p>
                </article>
              )}

              {filteredStoreInventory.length > 0 && (
                <div className="table-wrap store-snapshot-wrap">
                  <table className="inventory-table inventory-table-compact">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Inventory Name</th>
                    <th>Inventory Count</th>
                    <th>Preferred Count</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStoreInventory.map((item) => {
                    const shortage = Math.max(Number(item.preferredCount || 0) - Number(item.inventoryCount || 0), 0);
                    return (
                    <tr key={item.id}>
                      <td data-label="Category">{item.inventoryCategory}</td>
                      <td data-label="Inventory Name">{item.inventoryName}</td>
                      <td data-label="Inventory Count">{item.inventoryCount}</td>
                      <td data-label="Preferred Count">{item.preferredCount}</td>
                      <td data-label="Status">
                        <span className={shortage > 0 ? "status-chip danger" : "status-chip good"}>
                          {shortage > 0 ? `Gap ${shortage}` : "Healthy"}
                        </span>
                      </td>
                      <td data-label="Last Updated">{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "-"}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
                </div>
              )}
            </>
          )}
        </section>
      );
    }

    return (
      <section className="dashboard-content">
        <div className="section-row">
          <div>
              <p className="section-title icon-text"><UIIcon name="stores" />All Stores / Offices</p>
            <p className="section-sub">Find any location fast.</p>
          </div>
          <button
            type="button"
            className="action-btn"
            onClick={() => {
              if (stores.length > 0) {
                setSelectedStore(stores[0]);
                setStoreView("all-inventory");
              }
            }}
            disabled={stores.length === 0}
          >
            <UIIcon name="inventory" />
            All Inventory
          </button>
        </div>

        <label className="search-label">
          <span className="icon-text"><UIIcon name="search" />Search stores</span>
          <input
            type="text"
            value={storeSearch}
            onChange={(event) => setStoreSearch(event.target.value)}
            placeholder="e.g. HQ West, NW-101, 555-1000, Orange Ave"
          />
        </label>

        {loadingStores && <p>Loading stores...</p>}

        {!loadingStores && filteredStores.length === 0 && (
          <article className="empty-state-card">
            <h3>No stores found</h3>
            <p>Try another search.</p>
          </article>
        )}

        {!loadingStores && filteredStores.length > 0 && (
          <ul className="data-list">
            {filteredStores.map((store) => {
              const itemClass = "data-item clickable";
              return (
                <li
                  key={store.id}
                  className={itemClass}
                  onClick={() => {
                    setSelectedStore(store);
                    setStoreView("detail");
                    setStoreInventorySearch("");
                    setStoreInventoryCategoryFilter("All");
                    setStoreInventoryHealthFilter("all");
                    void loadStoreInventory(store.id);
                    setShowInventoryForm(false);
                  }}
                >
                  <div className="item-head">
                    <strong>{store.name}</strong>
                    <span>#{store.officeNumber}</span>
                  </div>
                  <p className="icon-text"><UIIcon name="phone" />{store.phone}</p>
                  <p className="icon-text"><UIIcon name="address" />{store.address}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  const renderAccount = () => {
    return (
      <section className="dashboard-content">
        <div>
          <p className="section-title icon-text"><UIIcon name="account" />Account Details</p>
          <p className="section-sub">{currentUser?.name} ({currentUser?.role})</p>
        </div>

        {isManager && (
          <>
            <div className="section-row">
              <div>
                <p className="section-title icon-text"><UIIcon name="team" />Add Employees</p>
                <p className="section-sub">Create team members.</p>
              </div>
            </div>

            <form className="grid-form" onSubmit={onAddEmployee}>
              <label>
                Employee name
                <input name="name" value={employeeForm.name} onChange={onEmployeeFormChange} required />
              </label>
              <label>
                Employee email
                <input type="email" name="email" value={employeeForm.email} onChange={onEmployeeFormChange} required />
              </label>
              <label>
                Temporary password
                <input type="password" name="password" value={employeeForm.password} onChange={onEmployeeFormChange} minLength={6} required />
              </label>
              <button type="submit" className="submit-btn">Add Employee</button>
            </form>

            <p className="section-title icon-text"><UIIcon name="team" />Your Employees</p>
            {loadingEmployees && <p>Loading employees...</p>}
            {!loadingEmployees && employees.length === 0 && <p>No employees added yet.</p>}
            {!loadingEmployees && employees.length > 0 && (
              <ul className="data-list">
                {employees.map((employee) => (
                  <li key={employee.id} className="data-item">
                    <div className="item-head">
                      <strong>{employee.name}</strong>
                      <span>{employee.role}</span>
                    </div>
                    <p>{employee.email}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {!isManager && (
          <p className="section-sub">Employee accounts are managed by your manager.</p>
        )}
      </section>
    );
  };

  const renderPosts = () => {
    const currentItem = dailyPostInventoryItems[dailyPostCurrentIndex];
    const groupedPostFeed = [];

    filteredPostFeed.forEach((post) => {
      const postedAtDate = new Date(post.postedAt);
      const bucketedMinute = Math.floor(postedAtDate.getMinutes() / 5) * 5;
      const timeBucket = `${postedAtDate.getFullYear()}-${String(postedAtDate.getMonth() + 1).padStart(2, "0")}-${String(postedAtDate.getDate()).padStart(2, "0")} ${String(postedAtDate.getHours()).padStart(2, "0")}:${String(bucketedMinute).padStart(2, "0")}`;
      const groupKey = `${post.storeId}::${post.postedByUserId}::${timeBucket}`;
      const latestGroup = groupedPostFeed[groupedPostFeed.length - 1];

      if (latestGroup && latestGroup.key === groupKey) {
        latestGroup.items.push({
          id: post.id,
          inventoryCategory: post.inventoryCategory,
          inventoryName: post.inventoryName,
          postedCount: post.postedCount
        });
      } else {
        groupedPostFeed.push({
          key: groupKey,
          storeId: post.storeId,
          storeName: post.storeName,
          storeOfficeNumber: post.storeOfficeNumber,
          postedByUserId: post.postedByUserId,
          postedByName: post.postedByName,
          postedByEmail: post.postedByEmail,
          postedAt: post.postedAt,
          items: [
            {
              id: post.id,
              inventoryCategory: post.inventoryCategory,
              inventoryName: post.inventoryName,
              postedCount: post.postedCount
            }
          ]
        });
      }
    });

    return (
      <section className="dashboard-content">
        <div className="section-block daily-post-launch">
          <div>
            <p className="section-title icon-text"><UIIcon name="edit" />Inventory Daily Post</p>
            <p className="section-sub">Open guided posting workflow.</p>
          </div>
          <button type="button" className="action-btn daily-post-launch-btn" onClick={onOpenDailyPostModal}>
            <UIIcon name="activity" />
            Inventory Daily Post
          </button>
        </div>

        <div className="section-block">
          <div className="section-row">
            <div>
              <p className="section-title icon-text"><UIIcon name="posts" />New Feed</p>
              <p className="section-sub">Grouped chain blocks by store and posting time.</p>
            </div>
          </div>

          <div className="overview-filter-grid">
            <label>
              <span className="icon-text"><UIIcon name="clock" />Date From</span>
              <input
                type="date"
                value={postFeedDateFrom}
                onChange={(event) => setPostFeedDateFrom(event.target.value)}
                max={postFeedDateTo || undefined}
              />
            </label>
            <label>
              <span className="icon-text"><UIIcon name="clock" />Date To</span>
              <input
                type="date"
                value={postFeedDateTo}
                onChange={(event) => setPostFeedDateTo(event.target.value)}
                min={postFeedDateFrom || undefined}
              />
            </label>
          </div>

          <div className="table-actions">
            <button
              type="button"
              className="signout-btn"
              onClick={() => {
                setPostFeedDateFrom("");
                setPostFeedDateTo("");
              }}
              disabled={!postFeedDateFrom && !postFeedDateTo}
            >
              Clear Date Filter
            </button>
          </div>

          {loadingPostFeed && <p>Loading feed...</p>}

          {!loadingPostFeed && filteredPostFeed.length === 0 && (
            <article className="empty-state-card">
              <h3>No posts found</h3>
              <p>Try changing or clearing the selected date range.</p>
            </article>
          )}

          {!loadingPostFeed && groupedPostFeed.length > 0 && (
            <ul className="feed-list">
              {groupedPostFeed.map((group) => {
                const postedAt = new Date(group.postedAt);
                const isMine = Number(group.postedByUserId) === Number(currentUser?.id);
                return (
                  <li key={group.key} className={isMine ? "feed-item mine" : "feed-item"}>
                    <div className="feed-head">
                      <strong>{group.postedByName || group.postedByEmail || "User"}</strong>
                      <span>{postedAt.toLocaleDateString()} at {postedAt.toLocaleTimeString()}</span>
                    </div>
                    {group.storeName && (
                      <p className="feed-location">Location: {group.storeName} #{group.storeOfficeNumber}</p>
                    )}
                    <div className="feed-items">
                      {group.items.map((entry) => (
                        <div key={entry.id} className="feed-line">
                          <span>{entry.inventoryCategory}: {entry.inventoryName}</span>
                          <strong>{entry.postedCount}</strong>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {showDailyPostModal && (
          <div className="modal-backdrop" role="presentation">
            <section className="modal-card" role="dialog" aria-modal="true" aria-label="Inventory Daily Post">
              <header className="modal-header">
                <div>
                  <p className="section-title icon-text"><UIIcon name="edit" />Inventory Daily Post</p>
                  <p className="section-sub">{dailyPostStoreLabel}</p>
                </div>
                <button type="button" className="signout-btn" onClick={onCloseDailyPostModal}>
                  Close
                </button>
              </header>

              <div className="modal-body">
                <div className="overview-filter-grid">
                  <label>
                    <span className="icon-text"><UIIcon name="building" />Location</span>
                    <select value={dailyPostStoreId} onChange={onDailyPostStoreChange}>
                      <option value="">Select location</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name} #{store.officeNumber}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="icon-text"><UIIcon name="tag" />Inventory Category</span>
                    <select
                      value={dailyPostCategory}
                      onChange={(event) => setDailyPostCategory(event.target.value)}
                      disabled={!dailyPostStoreId}
                    >
                      <option value="">Select category</option>
                      {dailyPostCategories.map((category) => (
                        <option key={category.name} value={category.name}>{category.name}</option>
                      ))}
                    </select>
                    {loadingDailyPostCategories && <span className="tiny">Loading categories...</span>}
                  </label>
                </div>

                {dailyPostStep === "setup" && (
                  <div className="post-flow-card">
                    <p className="section-sub">Pick location and manager category to start the daily post.</p>
                    <button
                      type="button"
                      className="submit-btn"
                      onClick={onStartDailyPostFlow}
                      disabled={loadingDailyPostItems || !dailyPostStoreId || !dailyPostCategory}
                    >
                      <UIIcon name="activity" />
                      {loadingDailyPostItems ? "Preparing..." : "Start Daily Post"}
                    </button>
                  </div>
                )}

                {dailyPostStep === "entry" && currentItem && (
                  <article className="post-flow-card">
                    <p className="tiny">Phone Name</p>
                    <h3>{currentItem.inventoryName}</h3>
                    <p className="tiny">Category: {currentItem.inventoryCategory}</p>
                    <p className="tiny">Preferred: {currentItem.preferredCount}</p>

                    <label>
                      <span className="icon-text"><UIIcon name="inventory" />Inventory Count</span>
                      <input
                        type="number"
                        value={dailyPostDraftCounts[String(currentItem.id)] ?? "0"}
                        onChange={(event) => onDailyPostCountChange(currentItem.id, event.target.value)}
                      />
                    </label>

                    <div className="section-row">
                      <p className="tiny">Item {dailyPostCurrentIndex + 1} of {dailyPostInventoryItems.length}</p>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="signout-btn"
                          onClick={() => setDailyPostCurrentIndex((prev) => Math.max(prev - 1, 0))}
                          disabled={dailyPostCurrentIndex === 0}
                        >
                          Back
                        </button>
                        <button type="button" className="submit-btn" onClick={onDailyPostNext}>
                          {dailyPostCurrentIndex + 1 === dailyPostInventoryItems.length ? "Review" : "Next"}
                        </button>
                      </div>
                    </div>
                  </article>
                )}

                {dailyPostStep === "verify" && (
                  <section className="section-block">
                    <div className="section-row">
                      <div>
                        <p className="section-title icon-text"><UIIcon name="check" />Verify Daily Entries</p>
                        <p className="section-sub">Edit any row before final submit.</p>
                      </div>
                    </div>

                    <div className="table-wrap">
                      <table className="inventory-table">
                        <thead>
                          <tr>
                            <th>Phone Name</th>
                            <th>Category</th>
                            <th>Preferred</th>
                            <th>Count</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyPostInventoryItems.map((item, index) => (
                            <tr key={item.id}>
                              <td>{item.inventoryName}</td>
                              <td>{item.inventoryCategory}</td>
                              <td>{item.preferredCount}</td>
                              <td>
                                <input
                                  type="number"
                                  value={dailyPostDraftCounts[String(item.id)] ?? "0"}
                                  onChange={(event) => onDailyPostCountChange(item.id, event.target.value)}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="signout-btn"
                                  onClick={() => {
                                    setDailyPostCurrentIndex(index);
                                    setDailyPostStep("entry");
                                  }}
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="section-row">
                      <button type="button" className="signout-btn" onClick={() => setDailyPostStep("entry")}>
                        Back to Entry
                      </button>
                      <button
                        type="button"
                        className="submit-btn"
                        onClick={onSubmitDailyPost}
                        disabled={submittingDailyPost}
                      >
                        {submittingDailyPost ? "Submitting..." : "Submit Daily Post"}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    );
  };

  const renderBasicTab = (title) => {
    return (
      <section className="dashboard-content">
        <p className="section-title icon-text"><UIIcon name="overview" />{title}</p>
      </section>
    );
  };

  const renderTab = () => {
    if (activeTab === "overview") {
      return renderOverview();
    }
    if (activeTab === "account") {
      return renderAccount();
    }
    if (activeTab === "stores") {
      return renderStores();
    }
    if (activeTab === "posts") {
      return renderPosts();
    }
    return renderBasicTab("Overview");
  };

  if (isAuthenticated) {
    return (
      <main className="page dashboard-page">
        <section className="dashboard-card" aria-label="Dashboard">
          <header className="dashboard-header">
            <div className="section-row">
              <div>
                <p className="eyebrow">Dashboard</p>
                <h1>{tabHeading}</h1>
              </div>
              {activeTab === "account" && (
                <button type="button" className="signout-btn" onClick={() => onSignOut(true)}>
                  Sign Out
                </button>
              )}
            </div>
          </header>

          {renderTab()}
        </section>

        <nav className="bottom-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeTab === item.key ? "nav-item active" : "nav-item"}
              onClick={() => onNavigateTab(item.key)}
            >
              <span className="icon" aria-hidden="true">
                {item.key === "account" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c1.8-3 4.5-4.5 8-4.5S18.2 17 20 20" />
                  </svg>
                )}
                {item.key === "overview" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 13h8V3H3zM13 21h8v-8h-8zM13 3h8v6h-8zM3 21h8v-6H3z" />
                  </svg>
                )}
                {item.key === "posts" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5h16v14H4z" />
                    <path d="M8 9h8M8 13h8M8 17h5" />
                  </svg>
                )}
                {item.key === "stores" && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 21V8l8-5 8 5v13z" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="portal-card" aria-label="Authentication">
        <div className="brand-row">
          <div className="brand-icon" aria-hidden="true">
            <span></span>
          </div>
          <div>
            <p className="eyebrow">Secure Portal</p>
            <h1>Manager Login</h1>
          </div>
        </div>

        <div className="mode-toggle">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            <UIIcon name="account" />
            Login
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            <UIIcon name="plus" />
            Sign Up
          </button>
        </div>

        {mode === "signup" && <p className="section-sub">Manager signup only.</p>}

        <form onSubmit={onAuthSubmit} className="auth-form">
          {mode === "signup" && (
            <label>
              <span className="icon-text"><UIIcon name="account" />Full name</span>
              <input type="text" name="name" value={authForm.name} onChange={onAuthFormChange} required />
            </label>
          )}

          <label>
            <span className="icon-text"><UIIcon name="mail" />Email</span>
            <input type="email" name="email" value={authForm.email} onChange={onAuthFormChange} required />
          </label>

          <label>
            <span className="icon-text"><UIIcon name="lock" />Password</span>
            <input
              type="password"
              name="password"
              value={authForm.password}
              onChange={onAuthFormChange}
              minLength={6}
              required
            />
          </label>

          <button type="submit" className="submit-btn">
            {mode === "signup" ? "Create Manager Account" : "Login"}
          </button>
        </form>

        {message && <p className="status-text">{message}</p>}
      </section>
    </main>
  );
}

export default App;
