require("dotenv").config();

const mysql = require("mysql2/promise");

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?",
    [process.env.DB_NAME, tableName, columnName]
  );
  return rows[0].count > 0;
}

async function hasForeignKey(connection, tableName, constraintName) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.table_constraints WHERE table_schema = ? AND table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'",
    [process.env.DB_NAME, tableName, constraintName]
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
    const hasMainStoreId = await hasColumn(connection, "users", "main_store_id");
    if (!hasMainStoreId) {
      await connection.query("ALTER TABLE users ADD COLUMN main_store_id BIGINT NULL");
      console.log("Added users.main_store_id column.");
    } else {
      console.log("users.main_store_id already exists.");
    }

    const hasConstraint = await hasForeignKey(connection, "users", "fk_users_main_store");
    if (!hasConstraint) {
      await connection.query(
        "ALTER TABLE users ADD CONSTRAINT fk_users_main_store FOREIGN KEY (main_store_id) REFERENCES stores(id) ON DELETE SET NULL"
      );
      console.log("Added fk_users_main_store constraint.");
    } else {
      console.log("fk_users_main_store constraint already exists.");
    }

    console.log("Main store migration complete.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});