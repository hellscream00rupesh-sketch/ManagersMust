CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Employee', 'Active Manager', 'Manager') NOT NULL DEFAULT 'Employee',
  manager_id BIGINT NULL,
  main_store_id BIGINT NULL,
  CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  manager_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  office_number VARCHAR(60) NOT NULL,
  phone VARCHAR(60) NOT NULL,
  address VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stores_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  store_id BIGINT NOT NULL,
  inventory_category VARCHAR(120) NOT NULL,
  inventory_group VARCHAR(120) NULL,
  inventory_item_category VARCHAR(120) NULL,
  item_name VARCHAR(160) NOT NULL,
  sku VARCHAR(120) NULL,
  quantity INT NOT NULL DEFAULT 0,
  preferred_count INT NOT NULL DEFAULT 0,
  unit VARCHAR(40) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventories_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  manager_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_inventory_categories UNIQUE (manager_id, name),
  CONSTRAINT fk_inventory_categories_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_posts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  store_id BIGINT NOT NULL,
  inventory_id BIGINT NOT NULL,
  inventory_category VARCHAR(120) NOT NULL,
  inventory_group VARCHAR(120) NULL,
  inventory_item_category VARCHAR(120) NULL,
  inventory_name VARCHAR(160) NOT NULL,
  posted_count INT NOT NULL,
  posted_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_posts_store_created (store_id, created_at),
  CONSTRAINT fk_inventory_posts_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_posts_inventory FOREIGN KEY (inventory_id) REFERENCES inventories(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_posts_user FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
