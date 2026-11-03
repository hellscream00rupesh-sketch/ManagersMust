require("dotenv").config();

const mysql = require("mysql2/promise");

const statements = [
  `CREATE TABLE IF NOT EXISTS commission_settings (
    manager_id BIGINT PRIMARY KEY,
    act_rate_met DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    act_rate_unmet DECIMAL(10,2) NOT NULL DEFAULT 5.00,
    upg_rate_met DECIMAL(10,2) NOT NULL DEFAULT 4.00,
    upg_rate_unmet DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    accessory_pct DECIMAL(6,4) NOT NULL DEFAULT 0.0800,
    hi_rate DECIMAL(10,2) NOT NULL DEFAULT 20.00,
    default_kpi_rate DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    kpi_thresholds JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_commission_settings_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS commission_store_configs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    manager_id BIGINT NOT NULL,
    store_code VARCHAR(40) NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'B',
    act_goal INT NOT NULL DEFAULT 3,
    upg_goal INT NOT NULL DEFAULT 2,
    kpi_rate DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_commission_store_configs UNIQUE (manager_id, store_code),
    CONSTRAINT fk_commission_store_configs_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS commission_advocates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    manager_id BIGINT NOT NULL,
    employee_id VARCHAR(40) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    kpi_rate_override DECIMAL(10,2) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_commission_advocates UNIQUE (manager_id, employee_id),
    CONSTRAINT fk_commission_advocates_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS commission_datasets (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    manager_id BIGINT NOT NULL,
    month CHAR(7) NOT NULL,
    kind ENUM('sales', 'metrics') NOT NULL,
    source ENUM('upload') NOT NULL DEFAULT 'upload',
    file_name VARCHAR(255) NULL,
    row_count INT NOT NULL DEFAULT 0,
    payload LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_commission_datasets UNIQUE (manager_id, month, kind),
    CONSTRAINT fk_commission_datasets_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS commission_adjustments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    manager_id BIGINT NOT NULL,
    month CHAR(7) NOT NULL,
    employee_id VARCHAR(40) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_commission_adjustments UNIQUE (manager_id, month, employee_id),
    CONSTRAINT fk_commission_adjustments_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS commission_runs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    manager_id BIGINT NOT NULL,
    month CHAR(7) NOT NULL,
    results LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_commission_runs UNIQUE (manager_id, month),
    CONSTRAINT fk_commission_runs_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
  )`
];

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
    for (const statement of statements) {
      await connection.query(statement);
    }
    console.log("Migration applied: commission tables created.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
