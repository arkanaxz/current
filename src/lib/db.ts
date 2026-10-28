import "server-only";
import { mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { createClient, type InValue, type InStatement } from "@tursodatabase/serverless/compat";
import seedJson from "./seed-data.json";

export type AppUser = { id: number; username: string };
type SeedBill = { billDate: string | null; periodFrom: string | null; periodTo: string | null; ac: number | null; other: number | null; total: number | null; avgPerDay: number | null; generation: number | null; transmission: number | null; systemLoss: number | null; ancillary: number | null; bill: number | null; pricePerKwh: number | null; acFirstFloor: number | null; acSecondFloor: number | null; comment: string | null };
type SeedAc = { room: string; from: string; to: string; kwh: number };
type SeedMeter = { date: string; reading: number };
const seedData = seedJson as { bills: SeedBill[]; ac: SeedAc[]; meters: SeedMeter[] };
const schema = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, bill_date TEXT, period_from TEXT, period_to TEXT, ac REAL, other REAL, total REAL, avg_per_day REAL, generation REAL, transmission REAL, system_loss REAL, ancillary REAL, bill REAL, price_per_kwh REAL, ac_first_floor REAL, ac_second_floor REAL, comment TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS bills_user_period_idx ON bills(user_id,bill_date);
CREATE TABLE IF NOT EXISTS ac_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, room TEXT NOT NULL, period_from TEXT NOT NULL, period_to TEXT NOT NULL, kwh REAL NOT NULL, source TEXT NOT NULL DEFAULT 'LG ThinQ', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ac_user_period_idx ON ac_readings(user_id,period_from);
CREATE TABLE IF NOT EXISTS meter_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, reading_date TEXT NOT NULL, reading REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS meter_user_date_idx ON meter_readings(user_id,reading_date);
`;
const globals = globalThis as typeof globalThis & { electricityDb?: Database.Database; electricityTursoReady?: Promise<void> };
const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (url && !token) throw new Error("TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is set.");
const remote = url ? createClient({ url, authToken: token }) : undefined;
let local: Database.Database | undefined;
let ready: Promise<void>;
if (remote) ready = globals.electricityTursoReady ?? (globals.electricityTursoReady = remote.executeMultiple(schema));
else {
  const dir = process.env.DATA_DIR ? (isAbsolute(process.env.DATA_DIR) ? process.env.DATA_DIR : resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR)) : join(process.cwd(), "data");
  mkdirSync(dir,{recursive:true});
  local = globals.electricityDb ?? (globals.electricityDb = (() => { const d = new Database(join(dir,"electricity.sqlite")); d.pragma("journal_mode = WAL"); d.pragma("foreign_keys = ON"); d.exec(schema); return d; })());
  ready = Promise.resolve();
}
async function run(sql:string,args:unknown=[]):Promise<any> { await ready; return local ? local.prepare(sql).run(...((Array.isArray(args) ? args : [args]) as any[])) : remote!.execute(sql,args as never); }
async function one<T>(sql:string,args:unknown=[]):Promise<T|undefined> { await ready; if(local) return local.prepare(sql).get(...((Array.isArray(args) ? args : [args]) as any[])) as T|undefined; const result=await remote!.execute(sql,args as never); const row=result.rows[0]; return row ? remoteRow<T>(result.columns,row) : undefined; }
async function many<T>(sql:string,args:unknown=[]):Promise<T[]> { await ready; if(local) return local.prepare(sql).all(...((Array.isArray(args) ? args : [args]) as any[])) as T[]; const result=await remote!.execute(sql,args as never); return result.rows.map(row=>remoteRow<T>(result.columns,row)); }
export async function userCount() { return Number((await one<{count:number}>("SELECT COUNT(*) AS count FROM users"))?.count ?? 0); }
export async function createFirstUser(username:string,passwordHash:string,passwordSalt:string) {
 await ready;
 const statements:{sql:string;args:InValue[]}[]=[];
 const add=(sql:string,args:InValue[])=>statements.push({sql,args});
 add("INSERT INTO users(username,password_hash,password_salt) VALUES(?,?,?)",[username,passwordHash,passwordSalt]);
 const billSql="INSERT INTO bills(user_id,bill_date,period_from,period_to,ac,other,total,avg_per_day,generation,transmission,system_loss,ancillary,bill,price_per_kwh,ac_first_floor,ac_second_floor,comment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
 const acSql="INSERT INTO ac_readings(user_id,room,period_from,period_to,kwh) VALUES(?,?,?,?,?)";
 const meterSql="INSERT INTO meter_readings(user_id,reading_date,reading) VALUES(?,?,?)";
 if(local) {
  const create=local.transaction(()=>{ if(Number((local!.prepare("SELECT COUNT(*) AS count FROM users").get() as {count:number}).count)>0) throw new Error("ACCOUNT_ALREADY_EXISTS"); const id=Number(local!.prepare("INSERT INTO users(username,password_hash,password_salt) VALUES(?,?,?)").run(username,passwordHash,passwordSalt).lastInsertRowid);
   for(const b of seedData.bills as SeedBill[]) local!.prepare(billSql).run(id,b.billDate,b.periodFrom,b.periodTo,b.ac,b.other,b.total,b.avgPerDay,b.generation,b.transmission,b.systemLoss,b.ancillary,b.bill,b.pricePerKwh,b.acFirstFloor,b.acSecondFloor,b.comment);
   for(const a of seedData.ac) local!.prepare(acSql).run(id,a.room,a.from,a.to,a.kwh);
   for(const m of seedData.meters) local!.prepare(meterSql).run(id,m.date,m.reading); return id; }); return create();
 }
 const tx=await remote!.transaction("immediate"); statements.shift();
 try { const count=await tx.execute({sql:"SELECT COUNT(*) AS count FROM users"}); if(Number(count.rows[0]?.count??0)>0) throw new Error("ACCOUNT_ALREADY_EXISTS");
  await tx.execute({sql:"INSERT INTO users(username,password_hash,password_salt) VALUES(?,?,?)",args:[username,passwordHash,passwordSalt]});
  for(const b of seedData.bills as SeedBill[]) add(billSql,[1,b.billDate,b.periodFrom,b.periodTo,b.ac,b.other,b.total,b.avgPerDay,b.generation,b.transmission,b.systemLoss,b.ancillary,b.bill,b.pricePerKwh,b.acFirstFloor,b.acSecondFloor,b.comment]);
  for(const a of seedData.ac) add(acSql,[1,a.room,a.from,a.to,a.kwh]); for(const m of seedData.meters) add(meterSql,[1,m.date,m.reading]);
  // Resolve the created user ID inside SQL so the entire seed can be committed atomically.
  const rewrite=(s:{sql:string;args:InValue[]})=>({sql:s.sql.replace("VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)","SELECT id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM users ORDER BY id DESC LIMIT 1").replace("VALUES(?,?,?,?,?)","SELECT id,?,?,?,? FROM users ORDER BY id DESC LIMIT 1").replace("VALUES(?,?,?)","SELECT id,?,? FROM users ORDER BY id DESC LIMIT 1"),args:s.args.slice(1)});
  await tx.batch(statements.map(rewrite) as InStatement[]); await tx.commit(); const user=await remote!.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE",[username]); return Number(user.rows[0]?.id);
 } catch(e) { await tx.rollback(); throw e; } finally { tx.close(); }
}
export async function findUserByUsername(username:string) { return one<AppUser&{password_hash:string;password_salt:string}>("SELECT id,username,password_hash,password_salt FROM users WHERE username=? COLLATE NOCASE",[username]); }
export async function createSessionRecord(userId:number,tokenHash:string,expiresAt:number) { await run("DELETE FROM sessions WHERE expires_at<=?",[Date.now()]); await run("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",[tokenHash,userId,expiresAt]); }
export async function sessionUser(tokenHash:string) { return one<AppUser>("SELECT users.id,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?",[tokenHash,Date.now()]); }
export async function removeSession(tokenHash:string) { await run("DELETE FROM sessions WHERE token_hash=?",[tokenHash]); }
export async function dashboardData(userId:number) {
 const bills=await many("SELECT id,bill_date AS billDate,period_from AS periodFrom,period_to AS periodTo,ac,other,total,avg_per_day AS avgPerDay,generation,transmission,system_loss AS systemLoss,ancillary,bill,price_per_kwh AS pricePerKwh,ac_first_floor AS acFirstFloor,ac_second_floor AS acSecondFloor,comment FROM bills WHERE user_id=? ORDER BY bill_date DESC,id DESC",[userId]);
 const ac=await many('SELECT id,room,period_from AS "from",period_to AS "to",kwh,source FROM ac_readings WHERE user_id=? ORDER BY period_from DESC,id DESC',[userId]);
 const meters=await many("SELECT id,reading_date AS date,reading FROM meter_readings WHERE user_id=? ORDER BY reading_date DESC,id DESC",[userId]); return {bills,ac,meters};
}
export async function insertBill(userId:number,r:Record<string,string|number|null>) { return run("INSERT INTO bills(user_id,bill_date,period_from,period_to,ac,other,total,avg_per_day,generation,transmission,system_loss,ancillary,bill,price_per_kwh,comment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[userId,r.billDate,r.periodFrom,r.periodTo,r.ac,r.other,r.total,r.avgPerDay,r.generation,r.transmission,r.systemLoss,r.ancillary,r.bill,r.pricePerKwh,r.comment]); }
export async function insertAc(userId:number,r:Record<string,string|number|null>) { return run("INSERT INTO ac_readings(user_id,room,period_from,period_to,kwh) VALUES(?,?,?,?,?)",[userId,r.room,r.from,r.to,r.kwh]); }
export async function insertMeter(userId:number,r:Record<string,string|number|null>) { return run("INSERT INTO meter_readings(user_id,reading_date,reading) VALUES(?,?,?)",[userId,r.date,r.reading]); }










