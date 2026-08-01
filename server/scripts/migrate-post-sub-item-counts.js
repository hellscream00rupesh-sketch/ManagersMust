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
      CREATE TABLE IF NOT EXISTS inventory_post_sub_items (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        post_id BIGINT NOT NULL,
        sub_item_number INT NOT NULL,
        label VARCHAR(120) NOT NULL,
        posted_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_inventory_post_sub_items UNIQUE (post_id, sub_item_number),
        CONSTRAINT fk_inventory_post_sub_items_post FOREIGN KEY (post_id) REFERENCES inventory_posts(id) ON DELETE CASCADE
      )
    `);

    console.log("Ensured inventory_post_sub_items table exists.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
