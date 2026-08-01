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
  const exists = await hasColumn(connection, tableName, columnName);
  if (exists) {
    console.log(`${tableName}.${columnName} already exists.`);
    return;
  }

  await connection.query(
    `ALTER TABLE ${tableName} ADD COLUMN ${ddl}${afterColumn ? ` AFTER ${afterColumn}` : ""}`
  );
  console.log(`Added ${tableName}.${columnName} column.`);
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
    await addColumnIfMissing(
      connection,
      "inventories",
      "inventory_item_category",
      "inventory_item_category VARCHAR(120) NULL",
      "inventory_group"
    );
    await addColumnIfMissing(
      connection,
      "inventory_posts",
      "inventory_item_category",
      "inventory_item_category VARCHAR(120) NULL",
      "inventory_group"
    );
    console.log("Inventory item-category migration complete.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});