#!/usr/bin/env bash
# Seeds the external test databases used by e2e/live-db.mjs.
#   PG_ADMIN_URL    postgres superuser URL (default postgresql://postgres:postgres@127.0.0.1:5432/postgres)
#   MYSQL_ROOT_PWD  MySQL root password (default empty)
set -euo pipefail
PG_ADMIN_URL=${PG_ADMIN_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}
MYSQL_ROOT_PWD=${MYSQL_ROOT_PWD:-}

psql "$PG_ADMIN_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP DATABASE IF EXISTS shop;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN CREATE ROLE app LOGIN PASSWORD 'apppass'; END IF; END $$;
CREATE DATABASE shop OWNER app;
SQL
PGPASSWORD=apppass psql -h 127.0.0.1 -U app shop -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA sales;
CREATE TABLE customers (id SERIAL PRIMARY KEY, name TEXT, email TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE orders (id SERIAL PRIMARY KEY, customer_id INT REFERENCES customers(id) ON DELETE CASCADE, total NUMERIC(10,2));
CREATE TABLE "Order Details" (id SERIAL PRIMARY KEY, note TEXT);
CREATE TABLE sales.leads (id SERIAL PRIMARY KEY, source TEXT);
INSERT INTO customers (name, email) VALUES ('Ann','ann@x.com'),('Bo','bo@x.com');
INSERT INTO orders (customer_id, total) VALUES (1,10.5),(1,5),(2,7.25);
INSERT INTO "Order Details" (note) VALUES ('x');
INSERT INTO sales.leads (source) VALUES ('web');
SQL

MYSQL_PWD="$MYSQL_ROOT_PWD" mysql -h 127.0.0.1 -uroot <<'SQL'
DROP DATABASE IF EXISTS shop;
CREATE DATABASE shop;
CREATE USER IF NOT EXISTS 'app'@'%' IDENTIFIED BY 'apppass';
GRANT ALL ON shop.* TO 'app'@'%';
FLUSH PRIVILEGES;
USE shop;
CREATE TABLE customers (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100), email VARCHAR(100), created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE orders (id INT PRIMARY KEY AUTO_INCREMENT, customer_id INT, total DECIMAL(10,2), FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE);
INSERT INTO customers (name,email) VALUES ('Ann','ann@x.com'),('Bo','bo@x.com');
INSERT INTO orders (customer_id,total) VALUES (1,10.5),(1,5),(2,7.25);
SQL
echo "[seed] external test databases ready"
