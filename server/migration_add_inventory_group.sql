ALTER TABLE inventories
ADD COLUMN inventory_group VARCHAR(120) NULL AFTER inventory_category;

ALTER TABLE inventory_posts
ADD COLUMN inventory_group VARCHAR(120) NULL AFTER inventory_category;
