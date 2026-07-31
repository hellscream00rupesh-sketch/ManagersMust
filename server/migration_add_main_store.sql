ALTER TABLE users
ADD COLUMN main_store_id BIGINT NULL,
ADD CONSTRAINT fk_users_main_store FOREIGN KEY (main_store_id) REFERENCES stores(id) ON DELETE SET NULL;