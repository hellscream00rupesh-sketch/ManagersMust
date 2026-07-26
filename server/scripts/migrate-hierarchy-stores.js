require("dotenv").config();

const mysql = require("mysql2/promise");

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?",
    [process.env.DB_NAME, tableName, columnName]
  );
  return rows[0].count > 0;
}

async function ensureColumn(connection, tableName, columnName, ddl) {
  const exists = await hasColumn(connection, tableName, columnName);
  if (!exists) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
    console.log(`Added ${columnName} to ${tableName} table.`);
  }
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
    const usersHasManagerId = await hasColumn(connection, "users", "manager_id");
    if (!usersHasManagerId) {
      await connection.query("ALTER TABLE users ADD COLUMN manager_id BIGINT NULL");
      await connection.query(
        "ALTER TABLE users ADD CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL"
      );
      console.log("Added manager_id to users table.");
    } else {
      console.log("users.manager_id already exists.");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        manager_id BIGINT NOT NULL,
        name VARCHAR(160) NOT NULL,
        office_number VARCHAR(60) NOT NULL,
        phone VARCHAR(60) NOT NULL,
        address VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_stores_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("Ensured stores table exists.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventories (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        store_id BIGINT NOT NULL,
        inventory_category VARCHAR(120) NOT NULL,
        item_name VARCHAR(160) NOT NULL,
        sku VARCHAR(120) NULL,
        quantity INT NOT NULL DEFAULT 0,
        preferred_count INT NOT NULL DEFAULT 0,
        unit VARCHAR(40) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_inventories_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      )
    `);
    console.log("Ensured inventories table exists.");

    await ensureColumn(connection, "inventories", "inventory_category", "inventory_category VARCHAR(120) NOT NULL DEFAULT 'General'");
    await ensureColumn(connection, "inventories", "preferred_count", "preferred_count INT NOT NULL DEFAULT 0");
    await ensureColumn(connection, "inventories", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventory_categories (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        manager_id BIGINT NOT NULL,
        name VARCHAR(120) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_inventory_categories UNIQUE (manager_id, name),
        CONSTRAINT fk_inventory_categories_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("Ensured inventory_categories table exists.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventory_posts (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        store_id BIGINT NOT NULL,
        inventory_id BIGINT NOT NULL,
        inventory_category VARCHAR(120) NOT NULL,
        inventory_name VARCHAR(160) NOT NULL,
        posted_count INT NOT NULL,
        posted_by_user_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_inventory_posts_store_created (store_id, created_at),
        CONSTRAINT fk_inventory_posts_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
        CONSTRAINT fk_inventory_posts_inventory FOREIGN KEY (inventory_id) REFERENCES inventories(id) ON DELETE CASCADE,
        CONSTRAINT fk_inventory_posts_user FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("Ensured inventory_posts table exists.");

    await connection.query(`
      INSERT IGNORE INTO inventory_categories (manager_id, name)
      SELECT s.manager_id, i.inventory_category
      FROM inventories i
      JOIN stores s ON s.id = i.store_id
      WHERE i.inventory_category IS NOT NULL AND i.inventory_category <> ''
    `);
    console.log("Backfilled inventory categories from existing inventory.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
