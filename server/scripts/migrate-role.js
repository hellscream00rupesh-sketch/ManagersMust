require("dotenv").config();

const mysql = require("mysql2/promise");

const roleColumnDDL = "ENUM('Employee', 'Active Manager', 'Manager') NOT NULL DEFAULT 'Employee'";

async function hasRoleColumn(connection) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = 'users' AND column_name = 'role'",
    [process.env.DB_NAME]
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
    const roleExists = await hasRoleColumn(connection);
    if (!roleExists) {
      await connection.query(`ALTER TABLE users ADD COLUMN role ${roleColumnDDL}`);
      console.log("Migration applied: role column added.");
    } else {
      await connection.query(`ALTER TABLE users MODIFY COLUMN role ${roleColumnDDL}`);
      console.log("Migration applied: role enum updated.");
    }
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
