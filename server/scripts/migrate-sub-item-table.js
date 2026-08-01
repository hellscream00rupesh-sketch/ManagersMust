require("dotenv").config();

const mysql = require("mysql2/promise");

function parseSubItemLabels(value) {
  return String(value || "")
    .split(/\r?\n|\||,/) 
    .map((entry) => entry.trim())
    .filter(Boolean);
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
    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventory_sub_items (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        inventory_id BIGINT NOT NULL,
        sub_item_number INT NOT NULL,
        label VARCHAR(120) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT uq_inventory_sub_items_number UNIQUE (inventory_id, sub_item_number),
        CONSTRAINT fk_inventory_sub_items_inventory FOREIGN KEY (inventory_id) REFERENCES inventories(id) ON DELETE CASCADE
      )
    `);
    console.log("Ensured inventory_sub_items table exists.");

    const [inventoryRows] = await connection.query(
      "SELECT id, inventory_item_category AS inventoryItemCategory FROM inventories ORDER BY id ASC"
    );

    for (const row of inventoryRows) {
      const [existing] = await connection.query(
        "SELECT COUNT(*) AS count FROM inventory_sub_items WHERE inventory_id = ?",
        [row.id]
      );

      if (Number(existing[0]?.count || 0) > 0) {
        continue;
      }

      const labels = parseSubItemLabels(row.inventoryItemCategory);
      if (labels.length === 0) {
        continue;
      }

      const placeholders = labels.map(() => "(?, ?, ?)").join(", ");
      const values = [];
      labels.forEach((label, index) => {
        values.push(row.id, index + 1, label);
      });

      await connection.query(
        `INSERT INTO inventory_sub_items (inventory_id, sub_item_number, label) VALUES ${placeholders}`,
        values
      );
    }

    console.log("Backfilled inventory_sub_items from existing inventory rows.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
