require("dotenv").config();

const mysql = require("mysql2/promise");

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
    await connection.query("ALTER TABLE users ADD COLUMN role ENUM('Employee', 'Manager') NOT NULL DEFAULT 'Employee'");
    console.log("Migration applied: role column added.");
  } catch (error) {
    if (String(error.message).includes("Duplicate column name 'role'")) {
      console.log("Migration skipped: role column already exists.");
    } else {
      throw error;
    }
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
