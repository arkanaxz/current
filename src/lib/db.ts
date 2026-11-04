import "server-only";
import { mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { createClient, type InValue, type InStatement } from "@tursodatabase/serverless/compat";
import seedJson from "./seed-data.json";

export type AppUser = { id: number; username: string; role: "admin" | "member" };
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
CREATE TABLE IF NOT EXISTS ac_reading_hours (ac_reading_id INTEGER PRIMARY KEY REFERENCES ac_readings(id) ON DELETE CASCADE, operation_hours REAL NOT NULL);
CREATE TABLE IF NOT EXISTS meter_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, reading_date TEXT NOT NULL, reading REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS meter_user_date_idx ON meter_readings(user_id,reading_date);
CREATE TABLE IF NOT EXISTS user_roles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member');
CREATE TABLE IF NOT EXISTS ai_settings (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, model TEXT NOT NULL, key_cipher TEXT NOT NULL, key_iv TEXT NOT NULL, key_tag TEXT NOT NULL, auto_analyze INTEGER NOT NULL DEFAULT 0, data_consent INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS analysis_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, model TEXT NOT NULL, answer TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS analysis_runs_user_date_idx ON analysis_runs(user_id,created_at);
CREATE TABLE IF NOT EXISTS analysis_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO user_roles(user_id,role) SELECT id,CASE WHEN id=(SELECT MIN(id) FROM users) THEN 'admin' ELSE 'member' END FROM users;
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
function remoteRow<T>(columns:string[],row:unknown):T { const values=row as unknown[]; return Object.fromEntries(columns.map((column,index)=>[column,values[index]])) as T; }
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
  const create=local.transaction(()=>{ if(Number((local!.prepare("SELECT COUNT(*) AS count FROM users").get() as {count:number}).count)>0) throw new Error("ACCOUNT_ALREADY_EXISTS"); const id=Number(local!.prepare("INSERT INTO users(username,password_hash,password_salt) VALUES(?,?,?)").run(username,passwordHash,passwordSalt).lastInsertRowid); local!.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,?)").run(id,"admin");
   for(const b of seedData.bills as SeedBill[]) local!.prepare(billSql).run(id,b.billDate,b.periodFrom,b.periodTo,b.ac,b.other,b.total,b.avgPerDay,b.generation,b.transmission,b.systemLoss,b.ancillary,b.bill,b.pricePerKwh,b.acFirstFloor,b.acSecondFloor,b.comment);
   for(const a of seedData.ac) local!.prepare(acSql).run(id,a.room,a.from,a.to,a.kwh);
   for(const m of seedData.meters) local!.prepare(meterSql).run(id,m.date,m.reading); return id; }); return create();
 }
 const tx=await remote!.transaction("immediate"); statements.shift();
 try { const count=await tx.execute({sql:"SELECT COUNT(*) AS count FROM users"}); if(Number(count.rows[0]?.count??0)>0) throw new Error("ACCOUNT_ALREADY_EXISTS");
  await tx.execute({sql:"INSERT INTO users(username,password_hash,password_salt) VALUES(?,?,?)",args:[username,passwordHash,passwordSalt]});
  await tx.execute({sql:"INSERT INTO user_roles(user_id,role) SELECT id,? FROM users WHERE username=? COLLATE NOCASE",args:["admin",username]});
  for(const b of seedData.bills as SeedBill[]) add(billSql,[1,b.billDate,b.periodFrom,b.periodTo,b.ac,b.other,b.total,b.avgPerDay,b.generation,b.transmission,b.systemLoss,b.ancillary,b.bill,b.pricePerKwh,b.acFirstFloor,b.acSecondFloor,b.comment]);
  for(const a of seedData.ac) add(acSql,[1,a.room,a.from,a.to,a.kwh]); for(const m of seedData.meters) add(meterSql,[1,m.date,m.reading]);
  // Resolve the created user ID inside SQL so the entire seed can be committed atomically.
  const rewrite=(s:{sql:string;args:InValue[]})=>({sql:s.sql.replace("VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)","SELECT id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM users ORDER BY id DESC LIMIT 1").replace("VALUES(?,?,?,?,?)","SELECT id,?,?,?,? FROM users ORDER BY id DESC LIMIT 1").replace("VALUES(?,?,?)","SELECT id,?,? FROM users ORDER BY id DESC LIMIT 1"),args:s.args.slice(1)});
  await tx.batch(statements.map(rewrite) as InStatement[]); await tx.commit(); const user=await remote!.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE",[username]); return Number(user.rows[0]?.id);
 } catch(e) { await tx.rollback(); throw e; } finally { tx.close(); }
}
export async function findUserByUsername(username:string) { return one<AppUser&{password_hash:string;password_salt:string}>("SELECT id,username,password_hash,password_salt FROM users WHERE username=? COLLATE NOCASE",[username]); }
export async function createSessionRecord(userId:number,tokenHash:string,expiresAt:number) { await run("DELETE FROM sessions WHERE expires_at<=?",[Date.now()]); await run("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",[tokenHash,userId,expiresAt]); }
export async function sessionUser(tokenHash:string) { return one<AppUser>("SELECT users.id,users.username,COALESCE(user_roles.role,CASE WHEN users.id=(SELECT MIN(id) FROM users) THEN 'admin' ELSE 'member' END) AS role FROM sessions JOIN users ON users.id=sessions.user_id LEFT JOIN user_roles ON user_roles.user_id=users.id WHERE sessions.token_hash=? AND sessions.expires_at>?",[tokenHash,Date.now()]); }
export async function removeSession(tokenHash:string) { await run("DELETE FROM sessions WHERE token_hash=?",[tokenHash]); }
export async function dashboardData(userId:number) {
 const ownerId=await primaryAdminId()??userId;
 const bills=await many("SELECT id,bill_date AS billDate,period_from AS periodFrom,period_to AS periodTo,ac,other,total,avg_per_day AS avgPerDay,generation,transmission,system_loss AS systemLoss,ancillary,bill,price_per_kwh AS pricePerKwh,ac_first_floor AS acFirstFloor,ac_second_floor AS acSecondFloor,comment FROM bills WHERE user_id=? ORDER BY COALESCE(bill_date,period_to) DESC,id DESC",[ownerId]);
 const ac=await many('SELECT ac_readings.id,room,period_from AS "from",period_to AS "to",kwh,source,ac_reading_hours.operation_hours AS operationHours FROM ac_readings LEFT JOIN ac_reading_hours ON ac_reading_hours.ac_reading_id=ac_readings.id WHERE ac_readings.user_id=? ORDER BY period_from DESC,ac_readings.id DESC',[ownerId]);
 const meters=await many("SELECT id,reading_date AS date,reading FROM meter_readings WHERE user_id=? ORDER BY reading_date DESC,id DESC",[ownerId]); return {bills,ac,meters};
}
export async function insertBill(userId:number,r:Record<string,string|number|null>) { return run("INSERT INTO bills(user_id,bill_date,period_from,period_to,ac,other,total,avg_per_day,generation,transmission,system_loss,ancillary,bill,price_per_kwh,comment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[userId,r.billDate,r.periodFrom,r.periodTo,r.ac,r.other,r.total,r.avgPerDay,r.generation,r.transmission,r.systemLoss,r.ancillary,r.bill,r.pricePerKwh,r.comment]); }
export async function updateBill(userId:number,id:number,r:Record<string,string|number|null>) { return run("UPDATE bills SET bill_date=?,period_from=?,period_to=?,ac=?,other=?,total=?,avg_per_day=?,generation=?,transmission=?,system_loss=?,ancillary=?,bill=?,price_per_kwh=?,comment=? WHERE id=? AND user_id=?",[r.billDate,r.periodFrom,r.periodTo,r.ac,r.other,r.total,r.avgPerDay,r.generation,r.transmission,r.systemLoss,r.ancillary,r.bill,r.pricePerKwh,r.comment,id,userId]); }
export async function insertAc(userId:number,r:Record<string,string|number|null>) {
 const result=await run("INSERT INTO ac_readings(user_id,room,period_from,period_to,kwh) VALUES(?,?,?,?,?)",[userId,r.room,r.from,r.to,r.kwh]);
 if(r.operationHours!=null) {
  let id=Number(result.lastInsertRowid??result.last_insert_rowid??0);
  if(!id) id=Number((await one<{id:number}>("SELECT id FROM ac_readings WHERE user_id=? AND room=? AND period_from=? AND period_to=? ORDER BY id DESC LIMIT 1",[userId,r.room,r.from,r.to]))?.id??0);
  if(id)await run("INSERT INTO ac_reading_hours(ac_reading_id,operation_hours) VALUES(?,?)",[id,r.operationHours]);
 }
}
export async function insertMeter(userId:number,r:Record<string,string|number|null>) { return run("INSERT INTO meter_readings(user_id,reading_date,reading) VALUES(?,?,?)",[userId,r.date,r.reading]); }











export async function primaryAdminId():Promise<number|undefined> { return (await one<{user_id:number}>(`SELECT user_id FROM user_roles WHERE role='admin' ORDER BY user_id LIMIT 1`))?.user_id; }
export async function createRegularUser(username:string,passwordHash:string,passwordSalt:string) { await run("INSERT INTO users(username,password_hash,password_salt) VALUES(?,?,?)",[username,passwordHash,passwordSalt]); const u=await one<{id:number}>("SELECT id FROM users WHERE username=? COLLATE NOCASE",[username]); if(u) await run("INSERT INTO user_roles(user_id,role) VALUES(?,?)",[u.id,"member"]); }
export async function listUsers() { return many<{id:number;username:string;role:string;createdAt:string}>("SELECT users.id,users.username,COALESCE(user_roles.role,'member') AS role,users.created_at AS createdAt FROM users LEFT JOIN user_roles ON user_roles.user_id=users.id ORDER BY users.id"); }
export async function saveAiSettings(userId:number,v:{provider:string;model:string;cipher:string;iv:string;tag:string;autoAnalyze:boolean;consent:boolean}) { await run("INSERT INTO ai_settings(user_id,provider,model,key_cipher,key_iv,key_tag,auto_analyze,data_consent) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,key_cipher=excluded.key_cipher,key_iv=excluded.key_iv,key_tag=excluded.key_tag,auto_analyze=excluded.auto_analyze,data_consent=excluded.data_consent,updated_at=CURRENT_TIMESTAMP",[userId,v.provider,v.model,v.cipher,v.iv,v.tag,v.autoAnalyze?1:0,v.consent?1:0]); }
export async function getAiSettings(userId:number) { return one<{provider:string;model:string;cipher:string;iv:string;tag:string;autoAnalyze:number;consent:number}>("SELECT provider,model,key_cipher AS cipher,key_iv AS iv,key_tag AS tag,auto_analyze AS autoAnalyze,data_consent AS consent FROM ai_settings WHERE user_id=?",[userId]); }
export async function createAnalysisRun(userId:number,provider:string,model:string,answer:string) { return run("INSERT INTO analysis_runs(user_id,provider,model,answer) VALUES(?,?,?,?)",[userId,provider,model,answer]); }
export async function analysisHistory() { const ownerId=await primaryAdminId(); if(!ownerId)return []; return many<{id:number;provider:string;model:string;answer:string;createdAt:string}>("SELECT id,provider,model,answer,created_at AS createdAt FROM analysis_runs WHERE user_id=? ORDER BY id DESC LIMIT 30",[ownerId]); }
export async function analysisComments() { const ownerId=await primaryAdminId(); if(!ownerId)return []; return many<{id:number;runId:number;username:string;body:string;createdAt:string}>("SELECT c.id,c.run_id AS runId,u.username,c.body,c.created_at AS createdAt FROM analysis_comments c JOIN users u ON u.id=c.user_id JOIN analysis_runs r ON r.id=c.run_id WHERE r.user_id=? ORDER BY c.id",[ownerId]); }
export async function addAnalysisComment(runId:number,userId:number,body:string) { const ownerId=await primaryAdminId(); if(!ownerId)throw new Error("No owner"); const result=await run("INSERT INTO analysis_comments(run_id,user_id,body) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM analysis_runs WHERE id=? AND user_id=?)",[runId,userId,body,runId,ownerId]); return Number(result.changes??result.rowsAffected??0)>0; }
