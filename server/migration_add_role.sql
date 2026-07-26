ALTER TABLE users
ADD COLUMN role ENUM('Employee', 'Manager') NOT NULL DEFAULT 'Employee';
