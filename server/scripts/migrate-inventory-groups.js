require("dotenv").config();

const mysql = require("mysql2/promise");

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?",
    [process.env.DB_NAME, tableName, columnName]
  );
  return rows[0].count > 0;
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
    const hasInventoryGroup = await hasColumn(connection, "inventories", "inventory_group");
    if (!hasInventoryGroup) {
      await connection.query("ALTER TABLE inventories ADD COLUMN inventory_group VARCHAR(120) NULL AFTER inventory_category");
      console.log("Added inventories.inventory_group column.");
    } else {
      console.log("inventories.inventory_group already exists.");
    }

    const hasPostGroup = await hasColumn(connection, "inventory_posts", "inventory_group");
    if (!hasPostGroup) {
      await connection.query("ALTER TABLE inventory_posts ADD COLUMN inventory_group VARCHAR(120) NULL AFTER inventory_category");
      console.log("Added inventory_posts.inventory_group column.");
    } else {
      console.log("inventory_posts.inventory_group already exists.");
    }

    console.log("Inventory group migration complete.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
