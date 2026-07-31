ALTER TABLE users
MODIFY COLUMN role ENUM('Employee', 'Active Manager', 'Manager') NOT NULL DEFAULT 'Employee';
