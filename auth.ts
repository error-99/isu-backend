import bcrypt from 'bcryptjs';
import type { Pool } from 'mysql2/promise';

const SALT_ROUNDS = 10;

/**
 * Checks if a string has the standard format of a bcrypt hash ($2a$, $2b$, or $2y$)
 */
export function isBcryptHash(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
}

/**
 * Hashes a plaintext password using bcrypt with 10 salt rounds
 */
export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText) {
    throw new Error('Password cannot be empty');
  }
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

/**
 * Synchronous version of hashPassword
 */
export function hashPasswordSync(plainText: string): string {
  if (!plainText) {
    throw new Error('Password cannot be empty');
  }
  return bcrypt.hashSync(plainText, SALT_ROUNDS);
}

/**
 * Verifies a candidate plaintext password against a stored password_hash.
 * Supports both bcrypt hashes and legacy raw text (for automatic upgrade).
 */
export async function verifyPassword(
  candidatePlain: string,
  storedHashOrPlain: string
): Promise<boolean> {
  if (!candidatePlain || !storedHashOrPlain) return false;

  if (isBcryptHash(storedHashOrPlain)) {
    try {
      return await bcrypt.compare(candidatePlain, storedHashOrPlain);
    } catch {
      return false;
    }
  }

  // Graceful fallback for unmigrated raw passwords
  return candidatePlain === storedHashOrPlain;
}

/**
 * Automatically inspects the students table and migrates any remaining
 * raw/unhashed passwords to bcrypt hashes.
 */
export async function migrateRawPasswordsToBcrypt(pool: Pool): Promise<number> {
  try {
    const [rows]: any = await pool.query(
      'SELECT id, student_id, password_hash FROM students'
    );
    if (!Array.isArray(rows)) return 0;

    let migratedCount = 0;
    for (const student of rows) {
      if (!isBcryptHash(student.password_hash)) {
        const hashed = await hashPassword(student.password_hash);
        await pool.query('UPDATE students SET password_hash = ? WHERE id = ?', [
          hashed,
          student.id,
        ]);
        migratedCount++;
      }
    }
    if (migratedCount > 0) {
      console.log(`[AUTH] Successfully migrated ${migratedCount} raw student password(s) to bcrypt hashes.`);
    }
    return migratedCount;
  } catch (err) {
    console.error('[AUTH] Password migration check error:', err);
    return 0;
  }
}
