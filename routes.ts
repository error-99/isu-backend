import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import {
  getMySqlPool,
  StudentRecord,
  getDatabaseStatus,
  getDatabaseErrorLogs,
  clearDatabaseErrorLogs,
  logDatabaseError,
  updateMySqlConfig,
  generateFullDatabaseSql,
  MYSQL_CONFIG,
} from './db';
import { hashPassword, verifyPassword, isBcryptHash } from './auth';

const router = Router();

// -------------------------------------------------------------
// PASSWORD RESET EMAIL CONFIGURATION
// -------------------------------------------------------------

// -------------------------------------------------------------
// PASSWORD RESET EMAIL CONFIGURATION
// -------------------------------------------------------------
import dns from 'dns';

// Force Node.js to use IPv4, fixing the ENETUNREACH error on Railway
dns.setDefaultResultOrder('ipv4first');

const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE !== 'false',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<void> {
  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    'no-reply@isuapp.com';

  await emailTransporter.sendMail({
    from,
    to: email,
    subject: 'Reset Your ISU Routine Password',
    text: [
      'Hello,',
      '',
      'We received a request to reset your ISU Routine account password.',
      '',
      `Reset your password using this link: ${resetUrl}`,
      '',
      'This link will expire in 15 minutes.',
      'If you did not request this, you can ignore this email.',
      '',
      'ISU Student Routine Portal',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto">
        <h2>Reset Your ISU Routine Password</h2>
        <p>Hello,</p>
        <p>We received a request to reset your account password.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
            Reset Password
          </a>
        </p>
        <p>This link will expire in <strong>15 minutes</strong>.</p>
        <p>If you did not request this, you can ignore this email.</p>
        <p>ISU Student Routine Portal</p>
      </div>
    `,
  });
}


// Ensure all API responses bypass client/proxy/browser cache completely
router.use((req: Request, res: Response, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Extract authenticated student directly from MySQL database via Bearer token
export async function getAuthStudent(req: Request): Promise<StudentRecord | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const raw = Buffer.from(token, 'base64').toString('utf-8');
    const [student_id] = raw.split(':');
    if (!student_id) return null;

    const pool = await getMySqlPool();
    if (!pool) return null;

    const [rows]: any = await pool.query('SELECT * FROM students WHERE student_id = ?', [student_id]);
    if (!rows || rows.length === 0) return null;

    const row = rows[0];
    const [courses]: any = await pool.query(
      'SELECT course_id FROM student_courses WHERE student_id = ? ORDER BY enrolled_at DESC',
      [student_id]
    );
    const enrolled = Array.isArray(courses) ? courses.map((c: any) => Number(c.course_id)) : [];

    return {
      id: row.id,
      student_id: row.student_id,
      name: row.name,
      department: row.department,
      batch_no: row.batch_no,
      semester_id: Number(row.semester_id),
      enrolled_courses: enrolled,
      total_credits: Number(row.total_credits) || 0,
      created_at: row.created_at,
      last_login: row.last_login,
    };
  } catch (err) {
    return null;
  }
}

// -------------------------------------------------------------
// 1. SYSTEM & DATABASE DIAGNOSTICS ROUTES
// -------------------------------------------------------------

router.get('/health', async (req: Request, res: Response) => {
  const status = await getDatabaseStatus();
  res.json({
    status: status.connected ? 'ok' : 'error',
    db: status.connected
      ? `MySQL Connected (${status.host}:${status.port}/${status.database})`
      : `MySQL Disconnected (${status.lastError || 'Unreachable'})`,
    provider: 'MySQL Server',
    ssl: 'Supported / TLS Encrypted',
    engine: 'MySQL Direct Queries',
    backendEnv: {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL || process.env.MYSQL_URL),
      hasHost: Boolean(process.env.MYSQL_HOST || process.env.DB_HOST),
      hasUser: Boolean(process.env.MYSQL_USER || process.env.DB_USER),
      hasPassword: Boolean(process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD),
      databaseName: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'defaultdb',
      sslMode: process.env.MYSQL_SSL || 'REQUIRED',
    },
    details: status,
    timestamp: new Date().toISOString(),
  });
});

router.get('/db/status', async (req: Request, res: Response) => {
  const status = await getDatabaseStatus();
  res.json({
    success: true,
    status,
    is_live_mysql: status.connected,
    backend_env_loaded: true,
  });
});

router.get('/db/errors', (req: Request, res: Response) => {
  const logs = getDatabaseErrorLogs();
  res.json({
    success: true,
    logs,
  });
});

router.post('/db/clear-errors', (req: Request, res: Response) => {
  clearDatabaseErrorLogs();
  res.json({
    success: true,
    message: 'Database error log cleared successfully',
  });
});

const handleDbConfigure = async (req: Request, res: Response) => {
  const { serviceUri, host, port, user, password, database } = req.body;
  updateMySqlConfig({
    serviceUri,
    host,
    port: port ? Number(port) : undefined,
    user,
    password,
    database,
  });

  const pool = await getMySqlPool(true);
  const isConn = pool !== null;

  res.json({
    success: isConn,
    message: isConn
      ? 'Successfully connected to MySQL database!'
      : 'Connection to MySQL failed. Details logged.',
  });
};

router.post('/db/configure', handleDbConfigure);
router.post('/db/config', handleDbConfigure);

router.post('/db/retry', async (req: Request, res: Response) => {
  const pool = await getMySqlPool(true);
  const isConn = pool !== null;
  res.json({
    success: isConn,
    message: isConn ? 'MySQL connected!' : 'Connection failed. Check logs.',
  });
});

router.get('/db/schema', (req: Request, res: Response) => {
  const fullSql = generateFullDatabaseSql();
  res.json({
    success: true,
    sql: fullSql,
    tables: ['students', 'departments', 'semesters', 'courses', 'student_courses', 'routines', 'notifications'],
  });
});

// -------------------------------------------------------------
// 2. PUBLIC METADATA ROUTES (QUERIED FROM MYSQL)
// -------------------------------------------------------------

router.get('/departments', async (req: Request, res: Response) => {
  try {
    const pool = await getMySqlPool();
    if (!pool) throw new Error('MySQL pool not available');
    const [rows]: any = await pool.query('SELECT code, name FROM departments ORDER BY code ASC');
    return res.json({
      success: true,
      data: {
        departments: rows.map((d: any) => d.code),
        departments_full: rows,
      },
    });
  } catch (err: any) {
    logDatabaseError(err, 'Get Departments');
    return res.status(500).json({ success: false, message: err?.message || 'Database error' });
  }
});

router.get('/semesters', async (req: Request, res: Response) => {
  try {
    const pool = await getMySqlPool();
    if (!pool) throw new Error('MySQL pool not available');
    const [rows]: any = await pool.query('SELECT id, name, is_active FROM semesters ORDER BY id ASC');
    return res.json({
      success: true,
      data: {
        semesters: rows.map((s: any) => ({
          id: s.id,
          name: s.name,
          is_active: Boolean(s.is_active),
        })),
      },
    });
  } catch (err: any) {
    logDatabaseError(err, 'Get Semesters');
    return res.status(500).json({ success: false, message: err?.message || 'Database error' });
  }
});

// -------------------------------------------------------------
// 3. AUTHENTICATION (REGISTER & LOGIN DIRECTLY IN MYSQL)
// -------------------------------------------------------------

router.post('/register', async (req: Request, res: Response) => {
  const {
    student_id,
    name,
    email,
    phone,
    password,
    department,
    batch_no,
    semester_id,
  } = req.body;

  const cleanedId = String(student_id || '').trim();
  const studentName = String(name || '').trim();
  const cleanedEmail = String(email || '').trim().toLowerCase();
  const cleanedPhone = String(phone || '').trim();
  const dept = String(department || '').trim();

  if (!cleanedId || !studentName || !cleanedEmail || !password || !dept) {
    return res.status(400).json({
      success: false,
      message: 'Please fill in all required fields (Student ID, Name, Email, Password, Department).',
    });
  }

  if (!/^\d+$/.test(cleanedId) || cleanedId.length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Student ID must be at least 10 numeric digits (e.g. 2023100201).',
    });
  }

  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(cleanedEmail)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid email address.',
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long.',
    });
  }

  const pool = await getMySqlPool();
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'MySQL Database is currently unavailable.',
    });
  }

  try {
    const [existing]: any = await pool.query(
      'SELECT id FROM students WHERE student_id = ?',
      [cleanedId]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A student with this ID already exists. Please sign in.',
      });
    }

    const [existingEmail]: any = await pool.query(
      'SELECT id FROM students WHERE LOWER(email) = ?',
      [cleanedEmail]
    );

    if (existingEmail && existingEmail.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const semId = Number(semester_id) || 1;
    const batch = String(batch_no || '1st');
    const hashedPassword = await hashPassword(String(password));

    const [result]: any = await pool.query(
      `INSERT INTO students
       (student_id, name, email, phone, password_hash, department, batch_no,
        semester_id, total_credits, last_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.0, NOW())`,
      [
        cleanedId,
        studentName,
        cleanedEmail,
        cleanedPhone || null,
        hashedPassword,
        dept,
        batch,
        semId,
      ]
    );

    const [defaultCourses]: any = await pool.query(
      'SELECT course_id, credit FROM courses WHERE department = ? AND semester_id = ? AND is_default = 1',
      [dept, semId]
    );

    let totalCredits = 0;
    if (Array.isArray(defaultCourses) && defaultCourses.length > 0) {
      for (const c of defaultCourses) {
        await pool.query(
          'INSERT IGNORE INTO student_courses (student_id, course_id, semester_id) VALUES (?, ?, ?)',
          [cleanedId, c.course_id, semId]
        );
        totalCredits += parseFloat(String(c.credit)) || 0;
      }
      await pool.query(
        'UPDATE students SET total_credits = ? WHERE student_id = ?',
        [totalCredits, cleanedId]
      );
    }

    const token = Buffer.from(`${cleanedId}:${Date.now()}`).toString('base64');

    return res.json({
      success: true,
      message: 'Registration successful! Default courses enrolled.',
      data: {
        user: {
          id: result.insertId,
          student_id: cleanedId,
          name: studentName,
          email: cleanedEmail,
          phone: cleanedPhone || null,
          department: dept,
          batch_no: batch,
          semester_id: semId,
          total_credits: totalCredits,
          last_login: new Date().toISOString(),
        },
        token,
      },
    });
  } catch (err: any) {
    logDatabaseError(err, 'MySQL Register');
    return res.status(500).json({
      success: false,
      message: 'Registration failed: ' + (err?.message || err),
    });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { student_id, password } = req.body;
  const cleanedId = String(student_id || '').trim();

  if (!cleanedId || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both Student ID and Password.',
    });
  }

  const pool = await getMySqlPool();
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'MySQL Database is unavailable.',
    });
  }

  try {
    const [rows]: any = await pool.query('SELECT * FROM students WHERE student_id = ?', [cleanedId]);
    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Student ID or Password.',
      });
    }

    const row = rows[0];
    const isPasswordValid = await verifyPassword(String(password), row.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Student ID or Password.',
      });
    }

    // Auto-migrate legacy plain-text password to bcrypt hash on successful login
    if (!isBcryptHash(row.password_hash)) {
      try {
        const upgradedHash = await hashPassword(String(password));
        await pool.query('UPDATE students SET password_hash = ? WHERE id = ?', [upgradedHash, row.id]);
      } catch (upgradeErr) {
        console.error('Failed to auto-upgrade legacy password hash:', upgradeErr);
      }
    }

    await pool.query('UPDATE students SET last_login = NOW() WHERE student_id = ?', [cleanedId]);

    const token = Buffer.from(`${row.student_id}:${Date.now()}`).toString('base64');

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: row.id,
          student_id: row.student_id,
          name: row.name,
          department: row.department,
          batch_no: row.batch_no,
          semester_id: Number(row.semester_id),
          total_credits: Number(row.total_credits) || 0,
          last_login: new Date().toISOString(),
        },
        token,
      },
    });
  } catch (err: any) {
    logDatabaseError(err, 'MySQL Login');
    return res.status(500).json({
      success: false,
      message: 'Login failed: ' + (err?.message || err),
    });
  }
});

// -------------------------------------------------------------
// PASSWORD RECOVERY
// -------------------------------------------------------------

router.post('/forgot-password', async (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!email || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address.',
    });
  }

  const pool = await getMySqlPool();
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'MySQL Database is currently unavailable.',
    });
  }

  try {
    const [rows]: any = await pool.query(
      'SELECT id, student_id, email FROM students WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );

    const genericMessage =
      'If an account exists with that email, a password-reset link has been sent.';

    if (!rows || rows.length === 0) {
      return res.json({ success: true, message: genericMessage });
    }

    const student = rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'UPDATE students SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?',
      [tokenHash, expiresAt, student.id]
    );

    const frontendUrl = (
      process.env.FRONTEND_URL || 'https://isuapp.vercel.app'
    ).replace(/\/+$/, '');

    const resetUrl =
      `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await sendPasswordResetEmail(email, resetUrl);

    console.log(`[AUTH] Password reset email sent for student ${student.student_id}`);

    return res.json({ success: true, message: genericMessage });
  } catch (err: any) {
    logDatabaseError(err, 'Forgot Password');
    console.error('[AUTH] Forgot password error:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to process password reset request.',
    });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const rawToken = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.new_password || '');

  if (!rawToken || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Reset token and new password are required.',
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters long.',
    });
  }

  const pool = await getMySqlPool();
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'MySQL Database is currently unavailable.',
    });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const [rows]: any = await pool.query(
      `SELECT id FROM students
       WHERE reset_token_hash = ?
         AND reset_token_expires IS NOT NULL
         AND reset_token_expires > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'This reset link is invalid or has expired.',
      });
    }

    const hashedPassword = await hashPassword(newPassword);

    await pool.query(
      `UPDATE students
       SET password_hash = ?,
           reset_token_hash = NULL,
           reset_token_expires = NULL
       WHERE id = ?`,
      [hashedPassword, rows[0].id]
    );

    return res.json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
    });
  } catch (err: any) {
    logDatabaseError(err, 'Reset Password');
    console.error('[AUTH] Reset password error:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to reset password.',
    });
  }
});

// -------------------------------------------------------------
// 4. USER ACTIONS (DIRECT MYSQL QUERIES)
// -------------------------------------------------------------

router.all('/user', async (req: Request, res: Response) => {
  const action = req.query.action || req.body?.action;
  const student = await getAuthStudent(req);

  if (!student) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Please sign in.',
    });
  }

  const pool = await getMySqlPool();
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'MySQL Database is unavailable.',
    });
  }

  try {
    // Profile ME
    if (action === 'me') {
      const [semRows]: any = await pool.query('SELECT * FROM semesters WHERE id = ?', [student.semester_id]);
      const current_semester = semRows && semRows.length > 0 ? semRows[0] : undefined;

      return res.json({
        success: true,
        data: {
          user: {
            id: student.id,
            student_id: student.student_id,
            name: student.name,
            department: student.department,
            batch_no: student.batch_no,
            semester_id: student.semester_id,
            total_credits: student.total_credits,
            last_login: student.last_login,
          },
          current_semester,
        },
      });
    }

    // Courses Enrolled by Student (from `student_courses` joined with `courses`)
    if (action === 'courses') {
      const [rows]: any = await pool.query(
        `SELECT c.*, sc.enrolled_at 
         FROM student_courses sc 
         JOIN courses c ON sc.course_id = c.course_id 
         WHERE sc.student_id = ? 
         ORDER BY sc.enrolled_at DESC`,
        [student.student_id]
      );

      const enrolledCourses = Array.isArray(rows)
        ? rows.map((c: any) => ({
            course_id: Number(c.course_id),
            id: Number(c.course_id),
            user_course_id: Number(c.course_id),
            course_code: c.course_code,
            course_name: c.course_name,
            department: c.department,
            semester_id: Number(c.semester_id),
            credit: parseFloat(String(c.credit)) || 3.0,
            is_selected: true,
            is_default: Boolean(c.is_default),
          }))
        : [];

      const total_credits = enrolledCourses.reduce((acc, c) => acc + c.credit, 0);

      // Keep student's total_credits updated in MySQL
      if (total_credits !== student.total_credits) {
        await pool.query('UPDATE students SET total_credits = ? WHERE student_id = ?', [
          totalCredits(enrolledCourses),
          student.student_id,
        ]);
      }

      return res.json({
        success: true,
        data: {
          courses: enrolledCourses,
          total_credits,
        },
      });
    }

    // Available Courses for student's department from MySQL
    if (action === 'available_courses') {
      const [rows]: any = await pool.query(
        `SELECT c.*, 
                CASE WHEN sc.course_id IS NOT NULL THEN 1 ELSE 0 END AS is_enrolled
         FROM courses c
         LEFT JOIN student_courses sc ON c.course_id = sc.course_id AND sc.student_id = ?
         WHERE c.department = ?
         ORDER BY c.semester_id ASC, c.course_code ASC`,
        [student.student_id, student.department]
      );

      const mapped = Array.isArray(rows)
        ? rows.map((c: any) => {
            const isEnrolled = Boolean(c.is_enrolled);
            const isFutureSemester = Number(c.semester_id) > student.semester_id;
            const isRetake = Number(c.semester_id) < student.semester_id;
            const isCurrent = Number(c.semester_id) === student.semester_id;

            return {
              course_id: Number(c.course_id),
              id: Number(c.course_id),
              user_course_id: Number(c.course_id),
              course_code: c.course_code,
              course_name: c.course_name,
              department: c.department,
              semester_id: Number(c.semester_id),
              credit: parseFloat(String(c.credit)) || 3.0,
              is_default: Boolean(c.is_default),
              is_selected: isEnrolled,
              is_locked: isFutureSemester,
              lock_reason: isFutureSemester
                ? `Locked: Available in Semester ${c.semester_id} (You are in Semester ${student.semester_id})`
                : undefined,
              category: isCurrent ? 'Current' : isRetake ? 'Retake / Down' : 'Future',
            };
          })
        : [];

      return res.json({
        success: true,
        data: {
          courses: mapped,
          student_semester_id: student.semester_id,
          department: student.department,
        },
      });
    }

    // Add Course
    if (action === 'add_course') {
      const course_id = Number(req.body?.course_id);
      if (!course_id || isNaN(course_id)) {
        return res.status(400).json({ success: false, message: 'Invalid course ID provided' });
      }

      const [courseRows]: any = await pool.query('SELECT * FROM courses WHERE course_id = ?', [course_id]);
      if (!courseRows || courseRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Course not found in catalog' });
      }

      const course = courseRows[0];
      if (course.department !== student.department) {
        return res.status(403).json({
          success: false,
          message: `Cannot enroll in courses outside your department (${student.department}).`,
        });
      }

      if (Number(course.semester_id) > student.semester_id) {
        return res.status(400).json({
          success: false,
          message: `Cannot enroll in ${course.course_code}. You are in Semester ${student.semester_id}, so courses for Semester ${course.semester_id} are locked.`,
        });
      }

      await pool.query(
        'INSERT IGNORE INTO student_courses (student_id, course_id, semester_id) VALUES (?, ?, ?)',
        [student.student_id, course_id, course.semester_id]
      );

      // Recalculate credits
      const [sumRows]: any = await pool.query(
        `SELECT SUM(c.credit) as total 
         FROM student_courses sc 
         JOIN courses c ON sc.course_id = c.course_id 
         WHERE sc.student_id = ?`,
        [student.student_id]
      );
      const totalCreditsVal = parseFloat(String(sumRows[0]?.total || 0));
      await pool.query('UPDATE students SET total_credits = ? WHERE student_id = ?', [
        totalCreditsVal,
        student.student_id,
      ]);

      const [enrolledRows]: any = await pool.query(
        'SELECT course_id FROM student_courses WHERE student_id = ? ORDER BY enrolled_at DESC',
        [student.student_id]
      );
      const enrolled = enrolledRows.map((r: any) => Number(r.course_id));

      return res.json({
        success: true,
        message: `Enrolled in ${course.course_code} - ${course.course_name}`,
        data: {
          enrolled_courses: enrolled,
          total_credits: totalCreditsVal,
          added_course: {
            ...course,
            id: course.course_id,
            credit: parseFloat(String(course.credit)),
          },
        },
      });
    }

    // Remove / Drop Course
    if (action === 'remove_course') {
      const course_id = Number(req.body?.course_id);
      if (!course_id || isNaN(course_id)) {
        return res.status(400).json({ success: false, message: 'Invalid course ID provided for drop' });
      }

      await pool.query('DELETE FROM student_courses WHERE student_id = ? AND course_id = ?', [
        student.student_id,
        course_id,
      ]);

      // Recalculate credits
      const [sumRows]: any = await pool.query(
        `SELECT SUM(c.credit) as total 
         FROM student_courses sc 
         JOIN courses c ON sc.course_id = c.course_id 
         WHERE sc.student_id = ?`,
        [student.student_id]
      );
      const totalCreditsVal = parseFloat(String(sumRows[0]?.total || 0));
      await pool.query('UPDATE students SET total_credits = ? WHERE student_id = ?', [
        totalCreditsVal,
        student.student_id,
      ]);

      const [enrolledRows]: any = await pool.query(
        'SELECT course_id FROM student_courses WHERE student_id = ? ORDER BY enrolled_at DESC',
        [student.student_id]
      );
      const enrolled = enrolledRows.map((r: any) => Number(r.course_id));

      return res.json({
        success: true,
        message: 'Course dropped successfully',
        data: {
          enrolled_courses: enrolled,
          total_credits: totalCreditsVal,
        },
      });
    }

    // Class Routines from MySQL
    if (action === 'routine') {
      const day = req.query.day as string;
      const course_id = req.query.course_id ? Number(req.query.course_id) : null;

      if (student.enrolled_courses.length === 0) {
        return res.json({ success: true, data: { routine: [] } });
      }

      let query = `
        SELECT r.*, c.course_code, c.course_name, c.credit
        FROM routines r
        JOIN courses c ON r.course_id = c.course_id
        WHERE r.course_id IN (?)
          AND (r.batch_no = 'ALL' OR r.batch_no = ?)
          AND (r.type = 'class' OR r.type = 'lab')
      `;
      const params: any[] = [student.enrolled_courses, student.batch_no];

      if (day && day !== 'All') {
        query += ' AND LOWER(r.day) = LOWER(?)';
        params.push(day);
      }
      if (course_id) {
        query += ' AND r.course_id = ?';
        params.push(course_id);
      }

      query += ` ORDER BY FIELD(r.day, 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), r.start_time ASC`;

      const [rows]: any = await pool.query(query, params);
      return res.json({
        success: true,
        data: { routine: rows || [] },
      });
    }

    // Class Tests (CTs) from MySQL
    if (action === 'ct') {
      if (student.enrolled_courses.length === 0) {
        return res.json({ success: true, data: { routine: [] } });
      }

      const query = `
        SELECT r.*, c.course_code, c.course_name, c.credit
        FROM routines r
        JOIN courses c ON r.course_id = c.course_id
        WHERE r.course_id IN (?)
          AND (r.type LIKE 'ct%')
        ORDER BY r.date ASC, r.start_time ASC
      `;
      const [rows]: any = await pool.query(query, [student.enrolled_courses]);
      return res.json({
        success: true,
        data: { routine: rows || [] },
      });
    }

    // Midterm & Final Exams from MySQL
    if (action === 'exams') {
      if (student.enrolled_courses.length === 0) {
        return res.json({ success: true, data: { routine: [] } });
      }

      const query = `
        SELECT r.*, c.course_code, c.course_name, c.credit
        FROM routines r
        JOIN courses c ON r.course_id = c.course_id
        WHERE r.course_id IN (?)
          AND (r.type = 'mid' OR r.type = 'final' OR r.type = 'makeup')
        ORDER BY r.date ASC, r.start_time ASC
      `;
      const [rows]: any = await pool.query(query, [student.enrolled_courses]);
      return res.json({
        success: true,
        data: { routine: rows || [] },
      });
    }

    // Notifications operations
    if (
      action === 'notifications' ||
      action === 'unread_count' ||
      action === 'mark_read' ||
      action === 'read_notification' ||
      action === 'mark_all_read' ||
      action === 'read_all_notifications' ||
      action === 'create_notification' ||
      action === 'add_notification'
    ) {
      return handleNotificationOperations(req, res, student, pool, String(action));
    }

    // Change Name
    if (action === 'change_name') {
      const newName = String(req.body?.name || '').trim();
      if (!newName) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      }
      await pool.query('UPDATE students SET name = ? WHERE student_id = ?', [newName, student.student_id]);
      return res.json({
        success: true,
        message: 'Name updated successfully',
        data: { name: newName },
      });
    }

    // Change Batch
    if (action === 'change_batch') {
      const newBatch = String(req.body?.batch_no || '').trim();
      if (!newBatch) {
        return res.status(400).json({ success: false, message: 'Batch cannot be empty' });
      }
      await pool.query('UPDATE students SET batch_no = ? WHERE student_id = ?', [newBatch, student.student_id]);
      return res.json({
        success: true,
        message: 'Batch updated successfully',
        data: { batch_no: newBatch },
      });
    }

    // Change Semester (and auto-enroll new semester default courses)
    if (action === 'change_semester') {
      const newSemester = Number(req.body?.semester_id);
      if (!newSemester || isNaN(newSemester)) {
        return res.status(400).json({ success: false, message: 'Invalid semester ID' });
      }

      await pool.query('UPDATE students SET semester_id = ? WHERE student_id = ?', [
        newSemester,
        student.student_id,
      ]);

      // Remove current enrolled and auto-enroll defaults for the new semester
      await pool.query('DELETE FROM student_courses WHERE student_id = ?', [student.student_id]);

      const [defaultCourses]: any = await pool.query(
        'SELECT course_id, credit FROM courses WHERE department = ? AND semester_id = ? AND is_default = 1',
        [student.department, newSemester]
      );

      let totalCredits = 0;
      if (Array.isArray(defaultCourses)) {
        for (const c of defaultCourses) {
          await pool.query(
            'INSERT IGNORE INTO student_courses (student_id, course_id, semester_id) VALUES (?, ?, ?)',
            [student.student_id, c.course_id, newSemester]
          );
          totalCredits += parseFloat(String(c.credit)) || 0;
        }
      }

      await pool.query('UPDATE students SET total_credits = ? WHERE student_id = ?', [
        totalCredits,
        student.student_id,
      ]);

      return res.json({
        success: true,
        message: `Semester updated to Semester ${newSemester}`,
        data: {
          semester_id: newSemester,
          total_credits: totalCredits,
        },
      });
    }

    // Change Department
    if (action === 'change_department') {
      const newDept = String(req.body?.department || '').trim();
      if (!newDept) {
        return res.status(400).json({ success: false, message: 'Department cannot be empty' });
      }

      await pool.query('UPDATE students SET department = ? WHERE student_id = ?', [newDept, student.student_id]);
      await pool.query('DELETE FROM student_courses WHERE student_id = ?', [student.student_id]);

      const [defaultCourses]: any = await pool.query(
        'SELECT course_id, credit FROM courses WHERE department = ? AND semester_id = ? AND is_default = 1',
        [newDept, student.semester_id]
      );

      let totalCredits = 0;
      if (Array.isArray(defaultCourses)) {
        for (const c of defaultCourses) {
          await pool.query(
            'INSERT IGNORE INTO student_courses (student_id, course_id, semester_id) VALUES (?, ?, ?)',
            [student.student_id, c.course_id, student.semester_id]
          );
          totalCredits += parseFloat(String(c.credit)) || 0;
        }
      }

      await pool.query('UPDATE students SET total_credits = ? WHERE student_id = ?', [
        totalCredits,
        student.student_id,
      ]);

      return res.json({
        success: true,
        message: `Department changed to ${newDept}`,
        data: {
          department: newDept,
          total_credits: totalCredits,
        },
      });
    }

    // Change Password
    if (action === 'change_password') {
      const currentPassword = String(req.body?.current_password || req.body?.old_password || '');
      const newPassword = String(req.body?.new_password || '');

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters.',
        });
      }

      const [rows]: any = await pool.query('SELECT password_hash FROM students WHERE student_id = ?', [
        student.student_id,
      ]);
      if (!rows || rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Student record not found.',
        });
      }

      const isCurrentValid = await verifyPassword(currentPassword, rows[0].password_hash);
      if (!isCurrentValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect.',
        });
      }

      // Securely hash the new password before storing in MySQL
      const hashedNewPassword = await hashPassword(newPassword);

      await pool.query('UPDATE students SET password_hash = ? WHERE student_id = ?', [
        hashedNewPassword,
        student.student_id,
      ]);

      return res.json({
        success: true,
        message: 'Password updated successfully.',
      });
    }

    return res.status(400).json({
      success: false,
      message: `Unknown action: ${action}`,
    });
  } catch (err: any) {
    logDatabaseError(err, `User Action (${action})`);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Database error occurred',
    });
  }
});

function totalCredits(courses: any[]): number {
  return courses.reduce((acc, c) => acc + (parseFloat(String(c.credit)) || 0), 0);
}

// -------------------------------------------------------------
// 5. NOTIFICATIONS CONTROLLER & DEDICATED ROUTE
// (Auto Course-enrolled, Semester-wide, Department, University-wide, & individual student_notification_reads)
// -------------------------------------------------------------

async function handleNotificationOperations(
  req: Request,
  res: Response,
  student: StudentRecord,
  pool: any,
  action: string
) {
  // 1. UNREAD COUNT
  if (action === 'unread_count') {
    const enrolledCourses =
      Array.isArray(student.enrolled_courses) && student.enrolled_courses.length > 0
        ? student.enrolled_courses
        : [0];

    const query = `
      SELECT COUNT(*) as unread_count
      FROM notifications n
      LEFT JOIN student_notification_reads snr 
        ON n.id = snr.notification_id AND snr.student_id = ?
      WHERE snr.read_at IS NULL AND (
        n.department = 'ALL' OR n.target_type = 'all'
        OR (n.department = ? AND (n.target_type = 'department' OR (n.semester_id IS NULL AND n.course_id IS NULL AND n.student_id IS NULL)))
        OR (n.department = ? AND n.semester_id = ? AND (n.target_type = 'semester' OR (n.course_id IS NULL AND n.student_id IS NULL)))
        OR (n.course_id IS NOT NULL AND n.course_id IN (?))
        OR (n.student_id = ?)
      )
    `;
    const [countRows]: any = await pool.query(query, [
      student.student_id,
      student.department,
      student.department,
      student.semester_id,
      enrolledCourses,
      student.student_id,
    ]);

    const count = countRows[0]?.unread_count || 0;
    return res.json({
      success: true,
      data: { unread_count: Number(count) },
    });
  }

  // 2. LIST NOTIFICATIONS
  if (action === 'list' || action === 'notifications') {
    const typeFilter = String(req.query.type || req.body?.type || '').trim();
    const enrolledCourses =
      Array.isArray(student.enrolled_courses) && student.enrolled_courses.length > 0
        ? student.enrolled_courses
        : [0];

    let query = `
      SELECT n.*, c.course_code, c.course_name,
             (CASE WHEN snr.read_at IS NOT NULL THEN 1 ELSE 0 END) AS is_read
      FROM notifications n
      LEFT JOIN courses c ON n.course_id = c.course_id
      LEFT JOIN student_notification_reads snr 
        ON n.id = snr.notification_id AND snr.student_id = ?
      WHERE (
        -- 1. All university broadcasts
        n.department = 'ALL' OR n.target_type = 'all'
        -- 2. Entire department broadcasts
        OR (n.department = ? AND (n.target_type = 'department' OR (n.semester_id IS NULL AND n.course_id IS NULL AND n.student_id IS NULL)))
        -- 3. Semester-wide broadcasts (student's current semester & department)
        OR (n.department = ? AND n.semester_id = ? AND (n.target_type = 'semester' OR (n.course_id IS NULL AND n.student_id IS NULL)))
        -- 4. Course-wise broadcasts: Auto-delivered to every student enrolled in that course!
        OR (n.course_id IS NOT NULL AND n.course_id IN (?))
        -- 5. Direct personal message (if student_id explicitly specified)
        OR (n.student_id = ?)
      )
    `;
    const params: any[] = [
      student.student_id,
      student.department,
      student.department,
      student.semester_id,
      enrolledCourses,
      student.student_id,
    ];

    if (typeFilter && typeFilter !== 'all') {
      if (typeFilter === 'mid') {
        query += " AND (n.type = 'mid' OR n.type = 'final')";
      } else {
        query += ' AND n.type = ?';
        params.push(typeFilter);
      }
    }

    query += ' ORDER BY n.created_at DESC LIMIT 100';

    const [rows]: any = await pool.query(query, params);
    const list = Array.isArray(rows)
      ? rows.map((n: any) => ({
          ...n,
          is_read: Boolean(n.is_read),
        }))
      : [];

    const unread_count = list.filter((n: any) => !n.is_read).length;
    return res.json({
      success: true,
      data: { notifications: list, count: list.length, unread_count },
    });
  }

  // 3. MARK SINGLE NOTIFICATION AS READ (Per-student read tracking)
  if (action === 'mark_read' || action === 'read_notification') {
    const notifId = Number(
      req.body?.notification_id || req.body?.id || req.query.notification_id || req.query.id
    );
    if (notifId) {
      await pool.query(
        'INSERT IGNORE INTO student_notification_reads (student_id, notification_id) VALUES (?, ?)',
        [student.student_id, notifId]
      );
    }
    return res.json({ success: true, data: { id: notifId, is_read: true } });
  }

  // 4. MARK ALL NOTIFICATIONS AS READ (Per-student read tracking)
  if (action === 'mark_all_read' || action === 'read_all_notifications') {
    const enrolledCourses =
      Array.isArray(student.enrolled_courses) && student.enrolled_courses.length > 0
        ? student.enrolled_courses
        : [0];

    const [visibleRows]: any = await pool.query(
      `SELECT n.id
       FROM notifications n
       WHERE (
         n.department = 'ALL' OR n.target_type = 'all'
         OR (n.department = ? AND (n.target_type = 'department' OR (n.semester_id IS NULL AND n.course_id IS NULL AND n.student_id IS NULL)))
         OR (n.department = ? AND n.semester_id = ? AND (n.target_type = 'semester' OR (n.course_id IS NULL AND n.student_id IS NULL)))
         OR (n.course_id IS NOT NULL AND n.course_id IN (?))
         OR (n.student_id = ?)
       )`,
      [
        student.department,
        student.department,
        student.semester_id,
        enrolledCourses,
        student.student_id,
      ]
    );

    if (Array.isArray(visibleRows) && visibleRows.length > 0) {
      for (const row of visibleRows) {
        await pool.query(
          'INSERT IGNORE INTO student_notification_reads (student_id, notification_id) VALUES (?, ?)',
          [student.student_id, row.id]
        );
      }
    }

    return res.json({
      success: true,
      message: 'All notifications marked as read',
      data: { unread_count: 0 },
    });
  }

  // 5. CREATE / PUBLISH ANNOUNCEMENT (Broadcast Course-wise, Semester-wise, Department, or University-wide)
  if (action === 'create_notification' || action === 'add_notification' || action === 'create') {
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    const type = String(req.body?.type || 'general').trim();
    const target_type = String(req.body?.target_type || 'course').trim();
    const course_id = req.body?.course_id ? Number(req.body.course_id) : null;
    const semester_id = req.body?.semester_id ? Number(req.body.semester_id) : null;
    const department = String(
      req.body?.department || (target_type === 'all' ? 'ALL' : student.department)
    ).trim();
    const link = String(req.body?.link || '').trim();
    const created_by = String(req.body?.created_by || student.name || 'Student Coordinator').trim();

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    let courseCode = '';
    if (course_id) {
      const [cRows]: any = await pool.query(
        'SELECT course_code, course_name FROM courses WHERE course_id = ?',
        [course_id]
      );
      if (cRows && cRows.length > 0) {
        courseCode = cRows[0].course_code;
      }
    }

    const [insertRes]: any = await pool.query(
      `INSERT INTO notifications 
       (target_type, department, semester_id, course_id, student_id, title, message, type, link, created_by)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      [
        target_type,
        department,
        semester_id,
        course_id,
        title,
        message,
        type,
        link || null,
        created_by,
      ]
    );

    const targetDesc = courseCode
      ? `course ${courseCode} (automatically delivered to all enrolled students)`
      : semester_id
      ? `Semester ${semester_id}`
      : department !== 'ALL'
      ? `Department ${department}`
      : 'the entire university';

    return res.json({
      success: true,
      message: `Notification published for ${targetDesc}!`,
      data: {
        id: insertRes.insertId,
        title,
        message,
        type,
        target_type,
        department,
        semester_id,
        course_id,
        course_code: courseCode,
        created_by,
      },
    });
  }

  return res.status(400).json({ success: false, message: `Unknown notification action: ${action}` });
}

// Dedicated notifications endpoint matching frontend api.ts
router.all('/notifications', async (req: Request, res: Response) => {
  const student = await getAuthStudent(req);
  if (!student) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Please sign in.',
    });
  }

  const pool = await getMySqlPool();
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'MySQL Database is unavailable.',
    });
  }

  const action = String(req.query.action || req.body?.action || 'list');
  try {
    return await handleNotificationOperations(req, res, student, pool, action);
  } catch (err: any) {
    logDatabaseError(err, `MySQL Notifications (${action})`);
    return res.status(500).json({
      success: false,
      message: 'Notification operation failed: ' + (err?.message || err),
    });
  }
});

// Universal Proxy endpoint to bypass browser CORS or mixed-content limitations when connecting to remote backends
router.all('/proxy', async (req: Request, res: Response) => {
  const target = req.query.target as string;
  console.log('🔄 /api/proxy called with target:', target);
  if (!target || !target.startsWith('http')) {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid target parameter. Must start with http:// or https://',
    });
  }

  try {
    const targetUrl = new URL(target);
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
    };

    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'] as string;
    }
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization as string;
    }

    const fetchOptions: any = {
      method: req.method,
      headers,
    };

    if (
      req.method !== 'GET' &&
      req.method !== 'HEAD' &&
      req.body &&
      Object.keys(req.body).length > 0
    ) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const remoteRes = await fetch(targetUrl.toString(), fetchOptions);
    const contentType = remoteRes.headers.get('content-type') || '';
    res.status(remoteRes.status);

    if (contentType.includes('application/json')) {
      const json = await remoteRes.json();
      return res.json(json);
    } else {
      const text = await remoteRes.text();
      return res.send(text);
    }
  } catch (err: any) {
    console.error('⚠️ /api/proxy error:', err);
    return res.status(502).json({
      success: false,
      message: `Proxy failed to connect to remote server: ${err?.message || err}`,
    });
  }
});

export default router;
