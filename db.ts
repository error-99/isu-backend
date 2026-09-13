// ============================================================
// ISU Routine Backend - MySQL Database Configuration
// ============================================================

import mysql from "mysql2/promise";
import "dotenv/config"; // Loads environment variables from your .env file

// ============================================================
// DATABASE CONFIGURATION (Securely using .env)
// ============================================================

let DB_HOST = process.env.DB_HOST || "";
let DB_PORT = Number(process.env.DB_PORT) || 3306;
let DB_USER = process.env.DB_USER || "";
let DB_PASSWORD = process.env.DB_PASSWORD || "";
let DB_NAME = process.env.DB_NAME || "";

const sslConfig = {
  rejectUnauthorized: false,
};

// ============================================================
// Types
// ============================================================

export type DatabaseErrorLog = {
  message: string;
  code?: string;
  errno?: number;
  sqlState?: string;
  sql?: string;
  timestamp: string;
};

export type MySqlConfig = {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl?: boolean | object;
};

// ============================================================
// Variables
// ============================================================

let pool: mysql.Pool | null = null;
let connectionErrorShown = false;

const databaseErrorLogs: DatabaseErrorLog[] = [];

// ============================================================
// Configuration log
// ============================================================

console.log("====================================================");
console.log("[DB CONFIG] Host:", DB_HOST);
console.log("[DB CONFIG] Port:", DB_PORT);
console.log("[DB CONFIG] Database:", DB_NAME);
console.log("[DB CONFIG] SSL: enabled");
console.log("====================================================");

// ============================================================
// Create pool
// ============================================================

function createPool(): mysql.Pool {
  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,

    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,

    enableKeepAlive: true,
    keepAliveInitialDelay: 0,

    ssl: sslConfig,
  });
}

// ============================================================
// Get MySQL pool
// ============================================================

export async function getMySqlPool(): Promise<mysql.Pool | null> {
  if (!pool) {
    pool = createPool();
  }

  try {
    const connection = await pool.getConnection();
    connection.release();

    if (!connectionErrorShown) {
      console.log(
        `✅ Connected to MySQL Database successfully at ${DB_HOST}:${DB_PORT}/${DB_NAME}`
      );
      console.log("🚀 MySQL Database connection established successfully.");

      connectionErrorShown = true;
    }

    return pool;
  } catch (error: any) {
    console.error("❌ MySQL Database connection failed:", {
      code: error?.code,
      message: error?.message,
    });

    return null;
  }
}

// ============================================================
// Update MySQL configuration
// Required by routes.ts
// ============================================================

export async function updateMySqlConfig(
  config: Partial<MySqlConfig>
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    if (config.host !== undefined) {
      DB_HOST = config.host;
    }

    if (config.port !== undefined) {
      DB_PORT = Number(config.port);
    }

    if (config.user !== undefined) {
      DB_USER = config.user;
    }

    if (config.password !== undefined) {
      DB_PASSWORD = config.password;
    }

    if (config.database !== undefined) {
      DB_NAME = config.database;
    }

    // Close the old pool so the next request uses new settings
    if (pool) {
      await pool.end();
      pool = null;
    }

    connectionErrorShown = false;

    console.log("✅ MySQL configuration updated.");
    console.log("[DB CONFIG] Host:", DB_HOST);
    console.log("[DB CONFIG] Port:", DB_PORT);
    console.log("[DB CONFIG] Database:", DB_NAME);

    return {
      success: true,
      message: "MySQL configuration updated successfully.",
    };
  } catch (error: any) {
    console.error("❌ Failed to update MySQL configuration:", error);

    return {
      success: false,
      message: error?.message || "Failed to update MySQL configuration.",
    };
  }
}

// ============================================================
// Generic query helper
// ============================================================

export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<T> {
  const db = await getMySqlPool();

  if (!db) {
    throw new Error("MySQL Database is currently unavailable.");
  }

  try {
    const [rows] = await db.query(sql, params);
    return rows as T;
  } catch (error: any) {
    logDatabaseError(error, sql);
    throw error;
  }
}

// ============================================================
// Log database error
// ============================================================

export function logDatabaseError(
  error: any,
  sql?: string
): void {
  const errorLog: DatabaseErrorLog = {
    message: error?.message || String(error),
    code: error?.code,
    errno: error?.errno,
    sqlState: error?.sqlState,
    sql,
    timestamp: new Date().toISOString(),
  };

  databaseErrorLogs.push(errorLog);

  if (databaseErrorLogs.length > 100) {
    databaseErrorLogs.shift();
  }

  console.error("[DATABASE ERROR]", errorLog);
}

// ============================================================
// Get database error logs
// ============================================================

export function getDatabaseErrorLogs(): DatabaseErrorLog[] {
  return [...databaseErrorLogs];
}

// ============================================================
// Clear database error logs
// ============================================================

export function clearDatabaseErrorLogs(): void {
  databaseErrorLogs.length = 0;
  console.log("✅ Database error logs cleared.");
}

// ============================================================
// Get database status
// ============================================================

export async function getDatabaseStatus(): Promise<{
  connected: boolean;
  host: string;
  port: number;
  user: string;
  database: string;
  message: string;
  timestamp: string;
}> {
  try {
    const db = await getMySqlPool();

    if (!db) {
      return {
        connected: false,
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        database: DB_NAME,
        message: "Database connection unavailable",
        timestamp: new Date().toISOString(),
      };
    }

    await db.query("SELECT 1");

    return {
      connected: true,
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      database: DB_NAME,
      message: "Database connection is healthy",
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    logDatabaseError(error);

    return {
      connected: false,
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      database: DB_NAME,
      message: error?.message || "Database connection failed",
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================
// Generate full database SQL
// ============================================================

export async function generateFullDatabaseSql(): Promise<string> {
  const db = await getMySqlPool();

  if (!db) {
    throw new Error("MySQL Database is currently unavailable.");
  }

  let sqlOutput = "";

  sqlOutput += "-- =====================================================\n";
  sqlOutput += "-- ISU Routine Database SQL Export\n";
  sqlOutput += `-- Generated: ${new Date().toISOString()}\n`;
  sqlOutput += "-- =====================================================\n\n";
  sqlOutput += "SET FOREIGN_KEY_CHECKS = 0;\n\n";

  const [tableRows] = await db.query("SHOW TABLES");
  const tables = tableRows as Record<string, string>[];

  for (const tableRow of tables) {
    const tableName = Object.values(tableRow)[0];

    if (!tableName) {
      continue;
    }

    try {
      const [createRows] = await db.query(
        `SHOW CREATE TABLE \`${tableName}\``
      );

      const createRow = (createRows as Record<string, string>[])[0];

      if (createRow) {
        const createKey = Object.keys(createRow).find((key) =>
          key.toLowerCase().startsWith("create table")
        );

        const createStatement = createKey
          ? createRow[createKey]
          : undefined;

        if (createStatement) {
          sqlOutput += `-- Table: ${tableName}\n`;
          sqlOutput += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
          sqlOutput += `${createStatement};\n\n`;
        }
      }

      const [dataRows] = await db.query(
        `SELECT * FROM \`${tableName}\``
      );

      const rows = dataRows as Record<string, any>[];

      if (rows.length > 0) {
        const columns = Object.keys(rows[0])
          .map((column) => `\`${column}\``)
          .join(", ");

        for (const row of rows) {
          const values = Object.keys(rows[0])
            .map((column) => {
              const value = row[column];

              if (value === null || value === undefined) {
                return "NULL";
              }

              if (typeof value === "number") {
                return String(value);
              }

              if (typeof value === "boolean") {
                return value ? "1" : "0";
              }

              if (value instanceof Date) {
                const formattedDate = value
                  .toISOString()
                  .slice(0, 19)
                  .replace("T", " ");

                return `'${formattedDate}'`;
              }

              if (Buffer.isBuffer(value)) {
                return `X'${value.toString("hex")}'`;
              }

              const escapedValue = String(value)
                .replace(/\\/g, "\\\\")
                .replace(/'/g, "''")
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n");

              return `'${escapedValue}'`;
            })
            .join(", ");

          sqlOutput +=
            `INSERT INTO \`${tableName}\` (${columns}) VALUES (${values});\n`;
        }

        sqlOutput += "\n";
      }
    } catch (error: any) {
      logDatabaseError(error, `Export table: ${tableName}`);

      console.warn(
        `[SQL EXPORT] Could not export table ${tableName}:`,
        error?.message || error
      );
    }
  }

  sqlOutput += "SET FOREIGN_KEY_CHECKS = 1;\n";

  return sqlOutput;
}

// ============================================================
// Initialize notification table
// ============================================================

export async function initializeNotificationTables(): Promise<void> {
  const db = await getMySqlPool();

  if (!db) {
    console.warn(
      "⚠️ Skipping notification table initialization because MySQL is unavailable."
    );
    return;
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        INDEX idx_notifications_student_id (student_id),
        INDEX idx_notifications_is_read (is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log("✅ Notification tables initialized successfully.");
  } catch (error: any) {
    logDatabaseError(error);

    console.warn(
      "Notice on initializing notification tables:",
      error?.message || error
    );
  }
}

// ============================================================
// Close MySQL pool
// ============================================================

export async function closeMySqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    connectionErrorShown = false;

    console.log("🛑 MySQL Database connection closed.");
  }
}

// ============================================================
// Default export
// ============================================================

export default getMySqlPool;