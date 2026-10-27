import Database from "better-sqlite3";
import { createClient } from "@tursodatabase/serverless/compat";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
const sourcePath = resolve(process.env.DATA_DIR ?? "./data", "electricity.sqlite");
if (!url || !token) throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running this migration.");
if (!existsSync(sourcePath)) throw new Error("Local SQLite database not found: " + sourcePath);

const source = new Database(sourcePath, { readonly: true });
const target = createClient({ url, authToken: token });
const schema = [
"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
"CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
"CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)",
"CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, bill_date TEXT, period_from TEXT, period_to TEXT, ac REAL, other REAL, total REAL, avg_per_day REAL, generation REAL, transmission REAL, system_loss REAL, ancillary REAL, bill REAL, price_per_kwh REAL, ac_first_floor REAL, ac_second_floor REAL, comment TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
"CREATE INDEX IF NOT EXISTS bills_user_period_idx ON bills(user_id,bill_date)",
"CREATE TABLE IF NOT EXISTS ac_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, room TEXT NOT NULL, period_from TEXT NOT NULL, period_to TEXT NOT NULL, kwh REAL NOT NULL, source TEXT NOT NULL DEFAULT 'LG ThinQ', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
"CREATE INDEX IF NOT EXISTS ac_user_period_idx ON ac_readings(user_id,period_from)",
"CREATE TABLE IF NOT EXISTS meter_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, reading_date TEXT NOT NULL, reading REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
"CREATE INDEX IF NOT EXISTS meter_user_date_idx ON meter_readings(user_id,reading_date)"
].join(";\n") + ";";
try {
  await target.executeMultiple(schema);
  const counts = await target.execute("SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM bills) AS bills, (SELECT COUNT(*) FROM ac_readings) AS ac, (SELECT COUNT(*) FROM meter_readings) AS meters");
  if (Object.values(counts.rows[0]).some((value) => Number(value) > 0)) throw new Error("Turso already contains data. Import stopped without changing destination records.");
  const tables = [
    ["users", ["id","username","password_hash","password_salt","created_at"]],
    ["bills", ["id","user_id","bill_date","period_from","period_to","ac","other","total","avg_per_day","generation","transmission","system_loss","ancillary","bill","price_per_kwh","ac_first_floor","ac_second_floor","comment","created_at"]],
    ["ac_readings", ["id","user_id","room","period_from","period_to","kwh","source","created_at"]],
    ["meter_readings", ["id","user_id","reading_date","reading","created_at"]]
  ];
  const statements = [];
  let copied = 0;
  for (const [table, columns] of tables) {
    const rows = source.prepare("SELECT " + columns.join(",") + " FROM " + table).all();
    for (const row of rows) {
      statements.push({ sql: "INSERT INTO " + table + "(" + columns.join(",") + ") VALUES(" + columns.map(() => "?").join(",") + ")", args: columns.map((column) => row[column]) });
      copied++;
    }
  }
  if (statements.length) await target.batch(statements, "immediate");
  console.log("Migration complete. Copied " + copied + " records. Login sessions were not copied; sign in again.");
} finally {
  source.close();
  target.close();
}

