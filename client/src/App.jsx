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
  const [postSelectedStoreId, setPostSelectedStoreId] = useState("");
  const [postSelectedCategory, setPostSelectedCategory] = useState("");
  const [postStoreCategories, setPostStoreCategories] = useState([]);
  const [loadingPostCategories, setLoadingPostCategories] = useState(false);
  const [postFlowStarted, setPostFlowStarted] = useState(false);
  const [postInventoryItems, setPostInventoryItems] = useState([]);
  const [postCurrentIndex, setPostCurrentIndex] = useState(0);
  const [postCountInput, setPostCountInput] = useState("0");
  const [postingCount, setPostingCount] = useState(false);
  const [postFeed, setPostFeed] = useState([]);
  const [loadingPostFeed, setLoadingPostFeed] = useState(false);
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

    void loadPostFeed(postSelectedStoreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab, postSelectedStoreId]);

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
    setSelectedStore(null);
    setStoreView("detail");
    setAllInventoryCategory("All");
    setCumulativeInventory([]);
    setCumulativeStores([]);
    setSelectedCumulativeStoreIds([]);
    setEditingInventoryKey("");
    setStoreInventory([]);
    setInventoryCategories([]);
    setShowInventoryForm(false);
    setPostSelectedStoreId("");
    setPostSelectedCategory("");
    setPostStoreCategories([]);
    setPostFlowStarted(false);
    setPostInventoryItems([]);
    setPostCurrentIndex(0);
    setPostCountInput("0");
    setPostFeed([]);
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

  const loadPostCategories = async (storeId) => {
    if (!storeId) {
      setPostStoreCategories([]);
      return;
    }

    setLoadingPostCategories(true);
    try {
      const response = await api.get(`/api/stores/${storeId}/inventory/categories`);
      setPostStoreCategories(response.data.categories || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch store categories.");
    } finally {
      setLoadingPostCategories(false);
    }
  };

  const loadPostFeed = async (storeId) => {
    setLoadingPostFeed(true);
    try {
      const response = storeId
        ? await api.get(`/api/stores/${storeId}/inventory/posts?limit=60`)
        : await api.get("/api/inventory/posts?limit=80");
      setPostFeed(response.data.posts || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not fetch inventory post feed.");
    } finally {
      setLoadingPostFeed(false);
    }
  };

  const onChangePostStore = async (event) => {
    const storeId = event.target.value;
    setPostSelectedStoreId(storeId);
    setPostSelectedCategory("");
    setPostFlowStarted(false);
    setPostInventoryItems([]);
    setPostCurrentIndex(0);
    setPostCountInput("0");
    await Promise.all([loadPostCategories(storeId), loadPostFeed(storeId)]);
  };

  const onStartPostFlow = async () => {
    if (!postSelectedStoreId) {
      setMessage("Select a store first.");
      return;
    }
    if (!postSelectedCategory) {
      setMessage("Select an inventory category first.");
      return;
    }

    try {
      const response = await api.get(
        `/api/stores/${postSelectedStoreId}/inventory?category=${encodeURIComponent(postSelectedCategory)}`
      );

      const items = response.data.inventory || [];
      setPostInventoryItems(items);
      setPostCurrentIndex(0);
      setPostCountInput(items.length > 0 ? String(items[0].inventoryCount ?? 0) : "0");
      setPostFlowStarted(true);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not start inventory post flow.");
    }
  };

  const onPostNext = async () => {
    const currentItem = postInventoryItems[postCurrentIndex];
    if (!currentItem) {
      return;
    }

    if (Number.isNaN(Number(postCountInput))) {
      setMessage("Inventory count must be a number. Enter 0 if none.");
      return;
    }

    setPostingCount(true);
    try {
      const response = await api.patch(
        `/api/stores/${postSelectedStoreId}/inventory/${currentItem.id}/count`,
        { inventoryCount: Number(postCountInput) }
      );

      const updatedItem = response.data.item;
      const newPost = response.data.post;
      setPostInventoryItems((prev) => {
        const next = [...prev];
        next[postCurrentIndex] = updatedItem;
        return next;
      });

      if (newPost) {
        setPostFeed((prev) => [newPost, ...prev]);
      }

      const nextIndex = postCurrentIndex + 1;
      if (nextIndex >= postInventoryItems.length) {
        setMessage("Inventory post completed for selected category.");
        setPostCurrentIndex(nextIndex);
        return;
      }

      setPostCurrentIndex(nextIndex);
      setPostCountInput(String(postInventoryItems[nextIndex].inventoryCount ?? 0));
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not update inventory count.");
    } finally {
      setPostingCount(false);
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
      setPostSelectedStoreId("");
      setPostSelectedCategory("");
      setPostStoreCategories([]);
      setPostFlowStarted(false);
      setPostInventoryItems([]);
      setPostCurrentIndex(0);
      setPostCountInput("0");
    }

    if (tabKey === "account") {
      setEmployeeForm({ name: "", email: "", password: "" });
    }

    setActiveTab(tabKey);
  };

  const renderOverview = () => {
    return (
      <section className="dashboard-content">
        <div className="section-row">
          <div>
            <p className="section-title">Stores / Offices</p>
            <p className="section-sub">
              {isManager
                ? "Create offices here. All offices are listed under the Stores / Offices tab."
                : "You can view offices assigned under your manager from Stores / Offices."}
            </p>
          </div>
          {isManager && (
            <button type="button" className="action-btn" onClick={() => setShowStoreForm((prev) => !prev)}>
              {showStoreForm ? "Close Form" : "Add Office / Store"}
            </button>
          )}
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

        <article className="empty-state-card">
          <h3>Stores list moved</h3>
          <p>Open Stores / Offices from the bottom navigation to search and browse all locations.</p>
        </article>
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
                <p className="section-title">All Inventory</p>
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
                            {visibleStoreColumns.reduce(
                              (sum, store) => sum + Number(item.countsByStore?.[String(store.id)] ?? 0),
                              0
                            )}
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
                <p className="section-title">Inventory: {selectedStore.name}</p>
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
              <p className="section-title">{selectedStore.name}</p>
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
            <div className="table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Inventory Name</th>
                    <th>Inventory Count</th>
                    <th>Preferred Count</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {storeInventory.map((item) => (
                    <tr key={item.id}>
                      <td>{item.inventoryCategory}</td>
                      <td>{item.inventoryName}</td>
                      <td>{item.inventoryCount}</td>
                      <td>{item.preferredCount}</td>
                      <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      );
    }

    return (
      <section className="dashboard-content">
        <div className="section-row">
          <div>
            <p className="section-title">All Stores / Offices</p>
            <p className="section-sub">
              Search by name, office number, phone number, or address.
            </p>
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
            All Inventory
          </button>
        </div>

        <label className="search-label">
          Search stores
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
            <p>Try another search or add a new office/store from Overview.</p>
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
                    void loadStoreInventory(store.id);
                    setShowInventoryForm(false);
                  }}
                >
                  <div className="item-head">
                    <strong>{store.name}</strong>
                    <span>#{store.officeNumber}</span>
                  </div>
                  <p>{store.phone}</p>
                  <p>{store.address}</p>
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
          <p className="section-title">Account Details</p>
          <p className="section-sub">{currentUser?.name} ({currentUser?.role})</p>
        </div>

        {isManager && (
          <>
            <div className="section-row">
              <div>
                <p className="section-title">Add Employees</p>
                <p className="section-sub">Employees created here are linked under your manager account.</p>
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

            <p className="section-title">Your Employees</p>
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
    const currentItem = postInventoryItems[postCurrentIndex];
    const selectedStore = stores.find((store) => String(store.id) === String(postSelectedStoreId));
    const groupedPostFeed = [];

    postFeed.forEach((post) => {
      const postedAtDate = new Date(post.postedAt);
      const minuteBucket = `${postedAtDate.getFullYear()}-${String(postedAtDate.getMonth() + 1).padStart(2, "0")}-${String(postedAtDate.getDate()).padStart(2, "0")} ${String(postedAtDate.getHours()).padStart(2, "0")}:${String(postedAtDate.getMinutes()).padStart(2, "0")}`;
      const key = `${post.storeId}::${post.postedByUserId}::${post.inventoryCategory}::${minuteBucket}`;
      const latestGroup = groupedPostFeed[groupedPostFeed.length - 1];

      if (latestGroup && latestGroup.key === key) {
        latestGroup.items.push({
          id: post.id,
          inventoryName: post.inventoryName,
          postedCount: post.postedCount,
          storeName: post.storeName,
          storeOfficeNumber: post.storeOfficeNumber
        });
      } else {
        groupedPostFeed.push({
          key,
          postedByUserId: post.postedByUserId,
          postedByName: post.postedByName,
          postedByEmail: post.postedByEmail,
          postedAt: post.postedAt,
          inventoryCategory: post.inventoryCategory,
          items: [
            {
              id: post.id,
              inventoryName: post.inventoryName,
              postedCount: post.postedCount,
              storeName: post.storeName,
              storeOfficeNumber: post.storeOfficeNumber
            }
          ]
        });
      }
    });

    return (
      <section className="dashboard-content">
        <div className="section-row">
          <div>
            <p className="section-title">Select Store / Office</p>
            <p className="section-sub">Choose a store before continuing. You can change it anytime.</p>
          </div>
        </div>

        <label>
          Store / Office
          <select value={postSelectedStoreId} onChange={onChangePostStore}>
            <option value="">Select store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} #{store.officeNumber}
              </option>
            ))}
          </select>
        </label>

        {!postSelectedStoreId && (
          <article className="empty-state-card">
            <h3>Select a location to continue</h3>
            <p>Inventory Post appears only after you select a store/office.</p>
          </article>
        )}

        {postSelectedStoreId && (
          <>
            <div className="section-block">
              <div className="section-row">
                <div>
                  <p className="section-title">Inventory Post</p>
                  <p className="section-sub">Select a category and update inventory one item at a time.</p>
                </div>
              </div>

              <label>
                Category
                <select
                  value={postSelectedCategory}
                  onChange={(event) => {
                    setPostSelectedCategory(event.target.value);
                    setPostFlowStarted(false);
                    setPostInventoryItems([]);
                    setPostCurrentIndex(0);
                  }}
                >
                  <option value="">Select category</option>
                  {postStoreCategories.map((category) => (
                    <option key={category.name} value={category.name}>{category.name}</option>
                  ))}
                </select>
                {loadingPostCategories && <span className="tiny">Loading categories...</span>}
              </label>

              <button type="button" className="action-btn" onClick={onStartPostFlow}>
                Start Inventory Post
              </button>

              {postFlowStarted && postInventoryItems.length === 0 && (
                <article className="empty-state-card">
                  <h3>No inventory in this category</h3>
                  <p>Nothing to post for the selected store/category yet.</p>
                </article>
              )}

              {postFlowStarted && currentItem && (
                <article className="post-flow-card">
                  <p className="section-sub">
                    Store: {selectedStore ? `${selectedStore.name} #${selectedStore.officeNumber}` : "Selected store"}
                  </p>
                  <h3>{currentItem.inventoryName}</h3>
                  <p className="tiny">Category: {currentItem.inventoryCategory}</p>
                  <p className="tiny">Preferred Count: {currentItem.preferredCount}</p>
                  <p className="tiny">
                    Last Updated: {currentItem.updatedAt ? new Date(currentItem.updatedAt).toLocaleString() : "Not updated yet"}
                  </p>

                  <label>
                    Inventory Count (enter 0 if none)
                    <input
                      type="number"
                      value={postCountInput}
                      onChange={(event) => setPostCountInput(event.target.value)}
                    />
                  </label>

                  <div className="section-row">
                    <p className="tiny">Item {postCurrentIndex + 1} of {postInventoryItems.length}</p>
                    <button type="button" className="submit-btn" onClick={onPostNext} disabled={postingCount}>
                      {postCurrentIndex + 1 === postInventoryItems.length ? "Save" : "Next"}
                    </button>
                  </div>
                </article>
              )}

              {postFlowStarted && postCurrentIndex >= postInventoryItems.length && postInventoryItems.length > 0 && (
                <article className="empty-state-card">
                  <h3>Posting Completed</h3>
                  <p>All inventory counts for this category have been updated in the database.</p>
                </article>
              )}
            </div>

          </>
        )}

        <div className="section-block">
          <div className="section-row">
            <div>
              <p className="section-title">New Feed</p>
              <p className="section-sub">
                {postSelectedStoreId
                  ? "Recent posted inventory for the selected location in time order."
                  : "Recent posted inventory across all your locations in time order."}
              </p>
            </div>
          </div>

          {loadingPostFeed && <p>Loading feed...</p>}

          {!loadingPostFeed && postFeed.length === 0 && (
            <article className="empty-state-card">
              <h3>No posts yet</h3>
              <p>
                {postSelectedStoreId
                  ? "Posted inventory updates for this store will appear here."
                  : "Posted inventory updates from all stores will appear here."}
              </p>
            </article>
          )}

          {!loadingPostFeed && postFeed.length > 0 && (
            <ul className="feed-list">
              {groupedPostFeed.map((group) => {
                const postedAt = new Date(group.postedAt);
                const isMine = Number(group.postedByUserId) === Number(currentUser?.id);
                const firstItem = group.items[0];
                return (
                  <li key={group.key} className={isMine ? "feed-item mine" : "feed-item"}>
                    <div className="feed-head">
                      <strong>{group.postedByName || group.postedByEmail || "User"}</strong>
                      <span>{postedAt.toLocaleDateString()} at {postedAt.toLocaleTimeString()}</span>
                    </div>
                    {!postSelectedStoreId && firstItem?.storeName && (
                      <p className="feed-location">Location: {firstItem.storeName} #{firstItem.storeOfficeNumber}</p>
                    )}
                    <p className="feed-category">Category: {group.inventoryCategory}</p>
                    <div className="feed-items">
                      {group.items.map((entry) => (
                        <div key={entry.id} className="feed-line">
                          <span>{entry.inventoryName}</span>
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
      </section>
    );
  };

  const renderBasicTab = (title) => {
    return (
      <section className="dashboard-content">
        <p className="section-title">{title}</p>
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
            Login
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            Sign Up
          </button>
        </div>

        {mode === "signup" && <p className="section-sub">Signup creates Manager accounts only.</p>}

        <form onSubmit={onAuthSubmit} className="auth-form">
          {mode === "signup" && (
            <label>
              Full name
              <input type="text" name="name" value={authForm.name} onChange={onAuthFormChange} required />
            </label>
          )}

          <label>
            Email
            <input type="email" name="email" value={authForm.email} onChange={onAuthFormChange} required />
          </label>

          <label>
            Password
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
