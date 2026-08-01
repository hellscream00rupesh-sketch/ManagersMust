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
    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventory_current_sub_item_counts (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        inventory_id BIGINT NOT NULL,
        sub_item_number INT NOT NULL,
        label VARCHAR(120) NOT NULL,
        current_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT uq_inventory_current_sub_item_counts UNIQUE (inventory_id, sub_item_number),
        CONSTRAINT fk_inventory_current_sub_item_counts_inventory FOREIGN KEY (inventory_id) REFERENCES inventories(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      INSERT INTO inventory_current_sub_item_counts (inventory_id, sub_item_number, label, current_count)
      SELECT
        latest.inventory_id,
        psi.sub_item_number,
        psi.label,
        psi.posted_count
      FROM (
        SELECT inventory_id, MAX(id) AS latestPostId
        FROM inventory_posts
        GROUP BY inventory_id
      ) latest
      JOIN inventory_post_sub_items psi ON psi.post_id = latest.latestPostId
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        current_count = VALUES(current_count)
    `);

    console.log("Ensured inventory_current_sub_item_counts table exists and backfilled latest sub-item counts.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
