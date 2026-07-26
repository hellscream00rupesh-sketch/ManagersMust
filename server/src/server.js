require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();
const port = Number(process.env.PORT || 4000);
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const validRoles = new Set(["Employee", "Manager"]);

const requiredEnv = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

app.use(
  cors({
    origin: corsOrigin.split(",").map((entry) => entry.trim()),
    credentials: false
  })
);
app.use(express.json());

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    managerId: user.manager_id || null
  };
}

function issueToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      managerId: user.manager_id || null
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function requireManager(req, res, next) {
  if (req.auth.role !== "Manager") {
    return res.status(403).json({ message: "Manager access required." });
  }

  return next();
}

async function getStoreForUser(user, storeId) {
  const [rows] = await pool.query(
    "SELECT id, manager_id, name, office_number AS officeNumber, phone, address FROM stores WHERE id = ?",
    [storeId]
  );

  if (rows.length === 0) {
    return null;
  }

  const store = rows[0];
  const managerId = user.role === "Manager" ? user.userId : user.managerId;
  if (!managerId || Number(store.manager_id) !== Number(managerId)) {
    return null;
  }

  return store;
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, message: "API and database are running." });
  } catch {
    res.status(500).json({ ok: false, message: "Database connection failed." });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required." });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  const safeRole = "Manager";

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);

    if (existing.length > 0) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, manager_id) VALUES (?, ?, ?, ?, ?)",
      [name.trim(), normalizedEmail, passwordHash, safeRole, null]
    );

    const [users] = await pool.query(
      "SELECT id, name, email, role, manager_id FROM users WHERE id = ?",
      [result.insertId]
    );
    const user = users[0];

    const token = issueToken(user);

    return res.status(201).json({ message: "Manager account created.", token, user: toPublicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: "Could not sign up.", detail: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const [rows] = await pool.query(
      "SELECT id, name, email, password_hash, role, manager_id FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "No account found." });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ message: "Invalid password." });
    }

    if (!validRoles.has(user.role)) {
      return res.status(500).json({ message: "Invalid role in account record." });
    }

    const token = issueToken(user);

    return res.json({ message: "Login successful.", token, user: toPublicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: "Could not log in.", detail: error.message });
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, email, role, manager_id FROM users WHERE id = ?", [
      req.auth.userId
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({ user: toPublicUser(rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch profile.", detail: error.message });
  }
});

app.post("/api/employees", requireAuth, requireManager, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required." });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);

    if (existing.length > 0) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [insert] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, manager_id) VALUES (?, ?, ?, 'Employee', ?)",
      [name.trim(), normalizedEmail, passwordHash, req.auth.userId]
    );

    const [rows] = await pool.query("SELECT id, name, email, role, manager_id FROM users WHERE id = ?", [
      insert.insertId
    ]);

    return res.status(201).json({ message: "Employee added.", employee: toPublicUser(rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: "Could not add employee.", detail: error.message });
  }
});

app.get("/api/employees", requireAuth, requireManager, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, role, manager_id FROM users WHERE manager_id = ? ORDER BY created_at DESC",
      [req.auth.userId]
    );

    return res.json({ employees: rows.map(toPublicUser) });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch employees.", detail: error.message });
  }
});

app.post("/api/stores", requireAuth, requireManager, async (req, res) => {
  const { name, officeNumber, phone, address } = req.body;

  if (!name || !officeNumber || !phone || !address) {
    return res.status(400).json({
      message: "Name, office number, phone and address are required."
    });
  }

  try {
    const [insert] = await pool.query(
      "INSERT INTO stores (manager_id, name, office_number, phone, address) VALUES (?, ?, ?, ?, ?)",
      [req.auth.userId, String(name).trim(), String(officeNumber).trim(), String(phone).trim(), String(address).trim()]
    );

    const [rows] = await pool.query(
      "SELECT id, manager_id, name, office_number AS officeNumber, phone, address, created_at AS createdAt FROM stores WHERE id = ?",
      [insert.insertId]
    );

    return res.status(201).json({ message: "Store/office added.", store: rows[0] });
  } catch (error) {
    return res.status(500).json({ message: "Could not add store/office.", detail: error.message });
  }
});

app.get("/api/stores", requireAuth, async (req, res) => {
  try {
    const managerId = req.auth.role === "Manager" ? req.auth.userId : req.auth.managerId;

    if (!managerId) {
      return res.json({ stores: [] });
    }

    const [rows] = await pool.query(
      "SELECT id, manager_id, name, office_number AS officeNumber, phone, address, created_at AS createdAt FROM stores WHERE manager_id = ? ORDER BY created_at DESC",
      [managerId]
    );

    return res.json({ stores: rows });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch stores/offices.", detail: error.message });
  }
});

app.get("/api/inventory-categories", requireAuth, async (req, res) => {
  try {
    const managerId = req.auth.role === "Manager" ? req.auth.userId : req.auth.managerId;
    if (!managerId) {
      return res.json({ categories: [] });
    }

    const [rows] = await pool.query(
      "SELECT id, manager_id AS managerId, name FROM inventory_categories WHERE manager_id = ? ORDER BY name ASC",
      [managerId]
    );

    return res.json({ categories: rows });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch inventory categories.", detail: error.message });
  }
});

app.get("/api/inventory/posts", requireAuth, async (req, res) => {
  const requestedLimit = Number(req.query.limit || 80);
  const safeLimit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 150) : 80;

  try {
    const managerId = req.auth.role === "Manager" ? req.auth.userId : req.auth.managerId;
    if (!managerId) {
      return res.json({ posts: [] });
    }

    const [rows] = await pool.query(
      `SELECT
         p.id,
         p.store_id AS storeId,
         s.name AS storeName,
         s.office_number AS storeOfficeNumber,
         p.inventory_id AS inventoryId,
         p.inventory_category AS inventoryCategory,
         p.inventory_name AS inventoryName,
         p.posted_count AS postedCount,
         p.posted_by_user_id AS postedByUserId,
         p.created_at AS postedAt,
         u.name AS postedByName,
         u.email AS postedByEmail
       FROM inventory_posts p
       JOIN stores s ON s.id = p.store_id
       JOIN users u ON u.id = p.posted_by_user_id
       WHERE s.manager_id = ?
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`,
      [managerId, safeLimit]
    );

    return res.json({ posts: rows });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch global inventory post feed.", detail: error.message });
  }
});

app.get("/api/inventory/cumulative", requireAuth, async (req, res) => {
  try {
    const managerId = req.auth.role === "Manager" ? req.auth.userId : req.auth.managerId;
    if (!managerId) {
      return res.json({ items: [] });
    }

    const [rows] = await pool.query(
      `SELECT
        i.inventory_category AS inventoryCategory,
        i.item_name AS inventoryName,
        SUM(i.quantity) AS cumulativeCount,
        SUM(i.preferred_count) AS cumulativePreferredCount,
        COUNT(DISTINCT i.store_id) AS storesCount
      FROM inventories i
      JOIN stores s ON s.id = i.store_id
      WHERE s.manager_id = ?
      GROUP BY i.inventory_category, i.item_name
      ORDER BY i.item_name ASC`,
      [managerId]
    );

    return res.json({ items: rows });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch cumulative inventory.", detail: error.message });
  }
});

app.patch("/api/inventory/cumulative", requireAuth, requireManager, async (req, res) => {
  const { inventoryCategory, inventoryName, newInventoryCategory, newInventoryName, preferredCount } = req.body;

  if (!inventoryCategory || !inventoryName) {
    return res.status(400).json({ message: "Current inventory category and name are required." });
  }

  if (!newInventoryCategory || !newInventoryName) {
    return res.status(400).json({ message: "New inventory category and name are required." });
  }

  if (preferredCount === undefined || preferredCount === null || Number.isNaN(Number(preferredCount))) {
    return res.status(400).json({ message: "Preferred Count is required and must be a number." });
  }

  try {
    const safeCurrentCategory = String(inventoryCategory).trim();
    const safeCurrentName = String(inventoryName).trim();
    const safeNewCategory = String(newInventoryCategory).trim();
    const safeNewName = String(newInventoryName).trim();
    const safePreferredCount = Number(preferredCount);

    await pool.query("INSERT IGNORE INTO inventory_categories (manager_id, name) VALUES (?, ?)", [
      req.auth.userId,
      safeNewCategory
    ]);

    const [update] = await pool.query(
      `UPDATE inventories i
       JOIN stores s ON s.id = i.store_id
       SET i.inventory_category = ?,
           i.item_name = ?,
           i.preferred_count = ?
       WHERE s.manager_id = ?
         AND i.inventory_category = ?
         AND i.item_name = ?`,
      [
        safeNewCategory,
        safeNewName,
        safePreferredCount,
        req.auth.userId,
        safeCurrentCategory,
        safeCurrentName
      ]
    );

    if (update.affectedRows === 0) {
      return res.status(404).json({ message: "No matching inventory item found to update." });
    }

    return res.json({ message: "Inventory updated.", affectedRows: update.affectedRows });
  } catch (error) {
    return res.status(500).json({ message: "Could not update inventory.", detail: error.message });
  }
});

app.get("/api/stores/:storeId/inventory", requireAuth, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const categoryFilter = req.query.category ? String(req.query.category).trim() : "";
  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ message: "Invalid store id." });
  }

  try {
    const store = await getStoreForUser(req.auth, storeId);
    if (!store) {
      return res.status(404).json({ message: "Store not found or not accessible." });
    }

    const values = [storeId];
    let query =
      "SELECT id, store_id AS storeId, inventory_category AS inventoryCategory, item_name AS inventoryName, quantity AS inventoryCount, preferred_count AS preferredCount, sku, unit, created_at AS createdAt, updated_at AS updatedAt FROM inventories WHERE store_id = ?";
    if (categoryFilter) {
      query += " AND inventory_category = ?";
      values.push(categoryFilter);
    }
    query += " ORDER BY item_name ASC";

    const [rows] = await pool.query(query, values);

    return res.json({ store, inventory: rows });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch inventory.", detail: error.message });
  }
});

app.get("/api/stores/:storeId/inventory/categories", requireAuth, async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ message: "Invalid store id." });
  }

  try {
    const store = await getStoreForUser(req.auth, storeId);
    if (!store) {
      return res.status(404).json({ message: "Store not found or not accessible." });
    }

    const [rows] = await pool.query(
      "SELECT inventory_category AS name FROM inventories WHERE store_id = ? GROUP BY inventory_category ORDER BY inventory_category ASC",
      [storeId]
    );

    return res.json({ categories: rows });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch store inventory categories.", detail: error.message });
  }
});

app.get("/api/stores/:storeId/inventory/posts", requireAuth, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const requestedLimit = Number(req.query.limit || 50);
  const safeLimit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;

  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ message: "Invalid store id." });
  }

  try {
    const store = await getStoreForUser(req.auth, storeId);
    if (!store) {
      return res.status(404).json({ message: "Store not found or not accessible." });
    }

    const [rows] = await pool.query(
      `SELECT
         p.id,
         p.store_id AS storeId,
         p.inventory_id AS inventoryId,
         p.inventory_category AS inventoryCategory,
         p.inventory_name AS inventoryName,
         p.posted_count AS postedCount,
         p.posted_by_user_id AS postedByUserId,
         p.created_at AS postedAt,
         u.name AS postedByName,
         u.email AS postedByEmail
       FROM inventory_posts p
       JOIN users u ON u.id = p.posted_by_user_id
       WHERE p.store_id = ?
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`,
      [storeId, safeLimit]
    );

    return res.json({ store, posts: rows });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch inventory post feed.", detail: error.message });
  }
});

app.post("/api/stores/:storeId/inventory", requireAuth, requireManager, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const { inventoryCategory, inventoryName, inventoryCount, preferredCount, addToAllStores } = req.body;

  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ message: "Invalid store id." });
  }

  if (!inventoryCategory) {
    return res.status(400).json({ message: "Inventory Category is required." });
  }

  if (!inventoryName) {
    return res.status(400).json({ message: "Inventory Name is required." });
  }

  if (preferredCount === undefined || preferredCount === null || Number.isNaN(Number(preferredCount))) {
    return res.status(400).json({ message: "Preferred Count is required and must be a number." });
  }

  if (inventoryCount !== undefined && inventoryCount !== null && inventoryCount !== "" && Number.isNaN(Number(inventoryCount))) {
    return res.status(400).json({ message: "Inventory Count must be a number when provided." });
  }

  try {
    const store = await getStoreForUser(req.auth, storeId);
    if (!store) {
      return res.status(404).json({ message: "Store not found or not accessible." });
    }

    const targetStoreIds = [];
    if (Boolean(addToAllStores)) {
      const [allStores] = await pool.query("SELECT id FROM stores WHERE manager_id = ?", [req.auth.userId]);
      allStores.forEach((entry) => targetStoreIds.push(entry.id));
    } else {
      targetStoreIds.push(storeId);
    }

    if (targetStoreIds.length === 0) {
      return res.status(400).json({ message: "No stores available for inventory insertion." });
    }

    const safeInventoryCount =
      inventoryCount === undefined || inventoryCount === null || inventoryCount === "" ? 0 : Number(inventoryCount);
    const safePreferredCount = Number(preferredCount);
    const safeCategory = String(inventoryCategory).trim();
    const safeName = String(inventoryName).trim();

    await pool.query("INSERT IGNORE INTO inventory_categories (manager_id, name) VALUES (?, ?)", [
      req.auth.userId,
      safeCategory
    ]);

    const placeholders = targetStoreIds.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const values = [];
    targetStoreIds.forEach((targetId) => {
      values.push(targetId, safeCategory, safeName, null, safeInventoryCount, safePreferredCount);
    });

    await pool.query(
      `INSERT INTO inventories (store_id, inventory_category, item_name, sku, quantity, preferred_count) VALUES ${placeholders}`,
      values
    );

    const [rows] = await pool.query(
      "SELECT id, store_id AS storeId, inventory_category AS inventoryCategory, item_name AS inventoryName, quantity AS inventoryCount, preferred_count AS preferredCount, sku, unit, created_at AS createdAt FROM inventories WHERE store_id = ? ORDER BY created_at DESC LIMIT 1",
      [storeId]
    );

    return res.status(201).json({
      message: Boolean(addToAllStores)
        ? `Inventory item added to ${targetStoreIds.length} stores.`
        : "Inventory item added.",
      item: rows[0],
      affectedStores: targetStoreIds.length
    });
  } catch (error) {
    return res.status(500).json({ message: "Could not add inventory item.", detail: error.message });
  }
});

app.patch("/api/stores/:storeId/inventory/:itemId/count", requireAuth, async (req, res) => {
  const storeId = Number(req.params.storeId);
  const itemId = Number(req.params.itemId);
  const { inventoryCount } = req.body;

  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ message: "Invalid store id." });
  }

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ message: "Invalid inventory item id." });
  }

  if (inventoryCount === undefined || inventoryCount === null || Number.isNaN(Number(inventoryCount))) {
    return res.status(400).json({ message: "Inventory Count is required and must be a number." });
  }

  try {
    const store = await getStoreForUser(req.auth, storeId);
    if (!store) {
      return res.status(404).json({ message: "Store not found or not accessible." });
    }

    const [update] = await pool.query(
      "UPDATE inventories SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND store_id = ?",
      [Number(inventoryCount), itemId, storeId]
    );

    if (update.affectedRows === 0) {
      return res.status(404).json({ message: "Inventory item not found for this store." });
    }

    const [rows] = await pool.query(
      "SELECT id, store_id AS storeId, inventory_category AS inventoryCategory, item_name AS inventoryName, quantity AS inventoryCount, preferred_count AS preferredCount, sku, unit, created_at AS createdAt, updated_at AS updatedAt FROM inventories WHERE id = ?",
      [itemId]
    );

    const updatedItem = rows[0];

    const [insertPost] = await pool.query(
      "INSERT INTO inventory_posts (store_id, inventory_id, inventory_category, inventory_name, posted_count, posted_by_user_id) VALUES (?, ?, ?, ?, ?, ?)",
      [
        storeId,
        itemId,
        updatedItem.inventoryCategory,
        updatedItem.inventoryName,
        Number(inventoryCount),
        req.auth.userId
      ]
    );

    const [postRows] = await pool.query(
      `SELECT
         p.id,
         p.store_id AS storeId,
         p.inventory_id AS inventoryId,
         p.inventory_category AS inventoryCategory,
         p.inventory_name AS inventoryName,
         p.posted_count AS postedCount,
         p.posted_by_user_id AS postedByUserId,
         p.created_at AS postedAt,
         u.name AS postedByName,
         u.email AS postedByEmail
       FROM inventory_posts p
       JOIN users u ON u.id = p.posted_by_user_id
         WHERE p.id = ?`,
      [insertPost.insertId]
    );

    return res.json({ message: "Inventory count updated.", item: updatedItem, post: postRows[0] || null });
  } catch (error) {
    return res.status(500).json({ message: "Could not update inventory count.", detail: error.message });
  }
});

app.listen(port, () => {
  console.log(`Auth API listening on port ${port}`);
});
