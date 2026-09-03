-- VALORA A TU PROFESOR — CLOUDFLARE D1
-- Ejecutar UNA VEZ en:
-- Cloudflare > Storage & databases > D1 > valora-db > Console

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1)),
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    length(code) = 7
    AND substr(code, 4, 1) = '-'
  )
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL UNIQUE,
  q1 INTEGER NOT NULL CHECK (q1 BETWEEN 1 AND 5),
  q2 INTEGER NOT NULL CHECK (q2 BETWEEN 1 AND 5),
  q3 INTEGER NOT NULL CHECK (q3 BETWEEN 1 AND 5),
  q4 INTEGER NOT NULL CHECK (q4 BETWEEN 1 AND 5),
  q5 INTEGER NOT NULL CHECK (q5 BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 500),
  average REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (code_id) REFERENCES codes(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS code_attempts (
  ip TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_codes_used ON codes(used);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);

-- Código inicial para probar la aplicación.
INSERT OR IGNORE INTO codes(code) VALUES ('666-333');
