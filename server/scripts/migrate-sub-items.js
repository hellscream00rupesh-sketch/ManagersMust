require("dotenv").config();

const mysql = require("mysql2/promise");

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?",
    [process.env.DB_NAME, tableName, columnName]
  );
  return rows[0].count > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, ddl, afterColumn) {
  if (await hasColumn(connection, tableName, columnName)) {
    console.log(`${tableName}.${columnName} already exists.`);
    return false;
  }

  await connection.query(
    `ALTER TABLE ${tableName} ADD COLUMN ${ddl}${afterColumn ? ` AFTER ${afterColumn}` : ""}`
  );
  console.log(`Added ${tableName}.${columnName} column.`);
  return true;
}

async function backfillInventorySubItemNumbers(connection) {
  const [rows] = await connection.query(
    `SELECT id, store_id AS storeId, inventory_category AS inventoryCategory, inventory_group AS inventoryGroup, item_name AS inventoryName
     FROM inventories
     ORDER BY store_id ASC, inventory_category ASC, inventory_group ASC, item_name ASC, created_at ASC, id ASC`
  );

  const counters = new Map();

  for (const row of rows) {
    const groupKey = [
      String(row.storeId),
      String(row.inventoryCategory || "").trim(),
      String(row.inventoryGroup || "").trim(),
      String(row.inventoryName || "").trim()
    ].join("::");

    const nextNumber = Number(counters.get(groupKey) || 0) + 1;
    counters.set(groupKey, nextNumber);

    await connection.query("UPDATE inventories SET sub_item_number = ? WHERE id = ?", [nextNumber, row.id]);
  }

  console.log(`Backfilled sub_item_number for ${rows.length} inventory row(s).`);
}

async function backfillInventoryPostSubItemNumbers(connection) {
  await connection.query(
    `UPDATE inventory_posts p
     JOIN inventories i ON i.id = p.inventory_id
     SET p.sub_item_number = i.sub_item_number
     WHERE p.sub_item_number IS NULL`
  );
  console.log("Backfilled inventory post sub-item numbers.");
}

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2" } : undefined
  });

  try {
    const inventoriesAdded = await addColumnIfMissing(
      connection,
      "inventories",
      "sub_item_number",
      "sub_item_number INT NULL",
      "inventory_item_category"
    );
    const postsAdded = await addColumnIfMissing(
      connection,
      "inventory_posts",
      "sub_item_number",
      "sub_item_number INT NULL",
      "inventory_item_category"
    );

    if (inventoriesAdded) {
      await backfillInventorySubItemNumbers(connection);
    }

    if (postsAdded || inventoriesAdded) {
      await backfillInventoryPostSubItemNumbers(connection);
    }

    console.log("Inventory sub-item migration complete.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});