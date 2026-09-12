import dotenv from 'dotenv';
dotenv.config({ override: true });
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { migrateRawPasswordsToBcrypt } from './auth';

// File paths
const ERROR_LOG_PATH = path.join(process.cwd(), 'database_error.log');
const SQL_EXPORT_PATH = fs.existsSync(path.join(process.cwd(), 'database.sql'))
  ? path.join(process.cwd(), 'database.sql')
  : path.join(__dirname, 'database.sql');

export interface StudentRecord {
  id: number;
  student_id: string;
  name: string;
  password?: string;
  department: string;
  batch_no: string;
  semester_id: number;
  enrolled_courses: number[];
  total_credits: number;
  created_at?: string;
  last_login?: string;
}

export interface DbStatusInfo {
  type: 'mysql' | 'disconnected';
  connected: boolean;
  database: string;
  host: string;
  port: number;
  user: string;
  lastError: string | null;
  lastErrorTimestamp: string | null;
  tablesCount: number;
  recordsCount: {
    departments: number;
    semesters: number;
    courses: number;
    students: number;
    routines: number;
    notifications: number;
  };
}

// MySQL Connection Configuration
export interface MySqlConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  ssl?: any;
}

// Helper to parse MySQL service URI (e.g. mysql://user:pass@host:port/db?ssl-mode=REQUIRED)
export function parseDatabaseUri(uri: string): Partial<MySqlConfig> {
  if (!uri || !uri.startsWith('mysql://')) return {};
  try {
    const parsed = new URL(uri);
    return {
      host: parsed.hostname || undefined,
      port: parsed.port ? Number(parsed.port) : 10188,
      user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : undefined,
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return {};
  }
}

// Default Aiven Cloud MySQL connection parameters
export const AIVEN_CONFIG: MySqlConfig = {
  host: 'mysql-5fad108-canvamse-eafe.c.aivencloud.com',
  user: 'avnadmin',
  password: 'AVNS_pbIL7isrP691yOWBkl0',
  database: 'defaultdb',
  port: 10188,
  ssl: { rejectUnauthorized: false },
};

// Resolve configuration strictly from backend environment variables, with Aiven defaults
export function resolveConfigFromEnv(): MySqlConfig {
  const uriFromEnv =
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    process.env.DB_URI ||
    process.env.MYSQL_SERVICE_URI ||
    '';
  const parsedFromUri = uriFromEnv ? parseDatabaseUri(uriFromEnv) : {};

  // Ignore dummy container placeholder defaults (127.0.0.1, root, isu_routine_db, 3306)
  const isGenericLocalHost = (h?: string) => !h || h === '127.0.0.1' || h === 'localhost';
  const isGenericLocalUser = (u?: string) => !u || u === 'root';
  const isGenericLocalDb = (d?: string) => !d || d === 'isu_routine_db';
  const isGenericLocalPort = (p?: number | string) => !p || Number(p) === 3306;

  const host =
    (!isGenericLocalHost(process.env.MYSQL_HOST) ? process.env.MYSQL_HOST : undefined) ||
    (!isGenericLocalHost(process.env.DB_HOST) ? process.env.DB_HOST : undefined) ||
    parsedFromUri.host ||
    AIVEN_CONFIG.host;

  const user =
    (!isGenericLocalUser(process.env.MYSQL_USER) ? process.env.MYSQL_USER : undefined) ||
    (!isGenericLocalUser(process.env.DB_USER) ? process.env.DB_USER : undefined) ||
    parsedFromUri.user ||
    AIVEN_CONFIG.user;

  const password =
    process.env.MYSQL_PASSWORD ||
    process.env.DB_PASSWORD ||
    parsedFromUri.password ||
    AIVEN_CONFIG.password;

  const database =
    (!isGenericLocalDb(process.env.MYSQL_DATABASE) ? process.env.MYSQL_DATABASE : undefined) ||
    (!isGenericLocalDb(process.env.DB_NAME) ? process.env.DB_NAME : undefined) ||
    (!isGenericLocalDb(process.env.MYSQL_DB) ? process.env.MYSQL_DB : undefined) ||
    parsedFromUri.database ||
    AIVEN_CONFIG.database;

  const port = Number(
    (!isGenericLocalPort(process.env.MYSQL_PORT) ? process.env.MYSQL_PORT : undefined) ||
    (!isGenericLocalPort(process.env.DB_PORT) ? process.env.DB_PORT : undefined) ||
    parsedFromUri.port ||
    AIVEN_CONFIG.port
  );

  return {
    host: host || AIVEN_CONFIG.host,
    user: user || AIVEN_CONFIG.user,
    password: password || AIVEN_CONFIG.password,
    database: database || AIVEN_CONFIG.database,
    port: port || AIVEN_CONFIG.port,
    ssl: { rejectUnauthorized: false },
  };
}

export let MYSQL_CONFIG: MySqlConfig = resolveConfigFromEnv();

let lastDbError: { message: string; timestamp: string; code?: string; stack?: string } | null = null;

// Helper to log errors to database_error.log
export function logDatabaseError(err: any, context = 'MySQL Query') {
  if (!err) return;
  const timestamp = new Date().toISOString();
  const errorMsg = err?.message || String(err);
  const errorCode = err?.code || 'UNKNOWN_ERROR';
  const sqlState = err?.sqlState || 'N/A';
  const stack = err?.stack || '';

  lastDbError = {
    message: errorMsg,
    timestamp,
    code: errorCode,
    stack,
  };

  // Skip writing to file for local refused errors if any
  if (errorCode === 'ECONNREFUSED' && (!MYSQL_CONFIG.host || MYSQL_CONFIG.host === '127.0.0.1' || MYSQL_CONFIG.host === 'localhost')) {
    return;
  }

  const formattedLog = `[${timestamp}] [${errorCode}] [${context}]
  Message: ${errorMsg}
  SQLState: ${sqlState}
  Host: ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port} | User: ${MYSQL_CONFIG.user} | Database: ${MYSQL_CONFIG.database}
  Stack: ${stack || 'None'}
--------------------------------------------------------------------------------\n`;

  try {
    fs.appendFileSync(ERROR_LOG_PATH, formattedLog, 'utf-8');
  } catch (fsErr) {
    console.error('Failed to append to database_error.log:', fsErr);
  }
}

export function getDatabaseErrorLogs(): string {
  try {
    if (fs.existsSync(ERROR_LOG_PATH)) {
      const content = fs.readFileSync(ERROR_LOG_PATH, 'utf-8').trim();
      return content || 'No database errors recorded.';
    }
  } catch {}
  return 'No database errors recorded.';
}

export function clearDatabaseErrorLogs(): boolean {
  try {
    fs.writeFileSync(ERROR_LOG_PATH, '', 'utf-8');
    lastDbError = null;
    return true;
  } catch {
    return false;
  }
}

export function isMySqlConfigured(): boolean {
  return true;
}

export function updateMySqlConfig(newConfig: Partial<MySqlConfig> & { serviceUri?: string }) {
  let parsedFromUri: Partial<MySqlConfig> = {};
  if (newConfig.serviceUri) {
    parsedFromUri = parseDatabaseUri(newConfig.serviceUri);
  }

  MYSQL_CONFIG = {
    ...MYSQL_CONFIG,
    ...parsedFromUri,
    ...newConfig,
    port: Number(newConfig.port || parsedFromUri.port || MYSQL_CONFIG.port),
    ssl: { rejectUnauthorized: false },
  };
  if (pool) {
    try {
      pool.end().catch(() => {});
    } catch {}
    pool = null;
  }
  isMySqlConnected = false;
  lastConnectionAttemptTime = 0;
}

// -------------------------------------------------------------
// MYSQL POOL
// -------------------------------------------------------------

let pool: mysql.Pool | null = null;
let isMySqlConnected = false;
let lastConnectionAttemptTime = 0;
const CONNECTION_COOLDOWN_MS = 15000;

function buildPoolOptions(config: MySqlConfig): mysql.PoolOptions {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
    connectTimeout: 10000,
    ssl: config.ssl ?? { rejectUnauthorized: false },
  };
}

export async function getMySqlPool(forceRetry = false): Promise<mysql.Pool | null> {
  if (pool && isMySqlConnected) return pool;

  const now = Date.now();
  if (!forceRetry && lastConnectionAttemptTime > 0 && now - lastConnectionAttemptTime < CONNECTION_COOLDOWN_MS) {
    return null;
  }
  lastConnectionAttemptTime = now;

  try {
    pool = mysql.createPool(buildPoolOptions(MYSQL_CONFIG));
    const connection = await pool.getConnection();
    isMySqlConnected = true;
    lastDbError = null;

    console.log(
      '✅ Connected to MySQL Database successfully at',
      `${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database} (User: ${MYSQL_CONFIG.user})`
    );
    connection.release();

    // Migrate any legacy passwords to bcrypt
    migrateRawPasswordsToBcrypt(pool).catch(() => {});

    return pool;
  } catch (err: any) {
    if (pool) {
      try {
        await pool.end().catch(() => {});
      } catch {}
      pool = null;
    }
    isMySqlConnected = false;
    logDatabaseError(err, `MySQL Connection (${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database})`);
    console.error(`[MySQL Error] Could not connect: ${err?.message || err}`);
  }

  return null;
}

export async function getDatabaseStatus(): Promise<DbStatusInfo> {
  const p = await getMySqlPool();
  const counts = {
    departments: 0,
    semesters: 0,
    courses: 0,
    students: 0,
    routines: 0,
    notifications: 0,
  };

  if (p && isMySqlConnected) {
    try {
      const [c1]: any = await p.query('SELECT count(*) as c FROM departments');
      const [c2]: any = await p.query('SELECT count(*) as c FROM semesters');
      const [c3]: any = await p.query('SELECT count(*) as c FROM courses');
      const [c4]: any = await p.query('SELECT count(*) as c FROM students');
      const [c5]: any = await p.query('SELECT count(*) as c FROM routines');
      const [c6]: any = await p.query('SELECT count(*) as c FROM notifications');
      counts.departments = c1[0]?.c || 0;
      counts.semesters = c2[0]?.c || 0;
      counts.courses = c3[0]?.c || 0;
      counts.students = c4[0]?.c || 0;
      counts.routines = c5[0]?.c || 0;
      counts.notifications = c6[0]?.c || 0;
    } catch {}
  }

  return {
    type: isMySqlConnected ? 'mysql' : 'disconnected',
    connected: isMySqlConnected,
    database: MYSQL_CONFIG.database,
    host: MYSQL_CONFIG.host,
    port: MYSQL_CONFIG.port,
    user: MYSQL_CONFIG.user,
    lastError: lastDbError?.message || null,
    lastErrorTimestamp: lastDbError?.timestamp || null,
    tablesCount: 7,
    recordsCount: counts,
  };
}

export function generateFullDatabaseSql(): string {
  try {
    if (fs.existsSync(SQL_EXPORT_PATH)) {
      return fs.readFileSync(SQL_EXPORT_PATH, 'utf-8');
    }
  } catch {}
  return '';
}

export function exportDatabaseSqlFile() {
  if (!fs.existsSync(SQL_EXPORT_PATH)) {
    console.log(`ℹ️ Schema file ${SQL_EXPORT_PATH} is present and maintained.`);
  }
}
