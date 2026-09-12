import { Router, Request, Response } from 'express';
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
  const { student_id, name, password, department, batch_no, semester_id } = req.body;
  const cleanedId = String(student_id || '').trim();

  if (!cleanedId || !name || !password || !department) {
    return res.status(400).json({
      success: false,
      message: 'Please fill in all required fields (Student ID, Name, Password, Department).',
    });
  }

  if (!/^\d+$/.test(cleanedId) || cleanedId.length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Student ID must be at least 10 numeric digits (e.g. 2023100201).',
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
    const [existing]: any = await pool.query('SELECT id FROM students WHERE student_id = ?', [cleanedId]);
    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A student with this ID already exists. Please sign in.',
      });
    }

    const semId = Number(semester_id) || 1;
    const batch = String(batch_no || '1st');
    const studentName = String(name).trim();
    const dept = String(department).trim();

    // Securely hash the password before saving to MySQL
    const hashedPassword = await hashPassword(String(password));

    const [result]: any = await pool.query(
      'INSERT INTO students (student_id, name, password_hash, department, batch_no, semester_id, total_credits, last_login) VALUES (?, ?, ?, ?, ?, ?, 0.0, NOW())',
      [cleanedId, studentName, hashedPassword, dept, batch, semId]
    );

    // Auto-enroll default courses from MySQL `courses` table
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
      await pool.query('UPDATE students SET total_credits = ? WHERE student_id = ?', [totalCredits, cleanedId]);
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

    // Notifications from MySQL
    if (action === 'notifications') {
      const query = `
        SELECT n.*, c.course_code, c.course_name
        FROM notifications n
        LEFT JOIN courses c ON n.course_id = c.course_id
        WHERE (n.student_id IS NULL OR n.student_id = ?)
          AND (n.department = ? OR n.department = 'ALL')
        ORDER BY n.created_at DESC
      `;
      const [rows]: any = await pool.query(query, [student.student_id, student.department]);
      const list = Array.isArray(rows)
        ? rows.map((n: any) => ({
            ...n,
            is_read: Boolean(n.is_read),
          }))
        : [];

      const unread_count = list.filter((n: any) => !n.is_read).length;
      return res.json({
        success: true,
        data: { notifications: list, unread_count },
      });
    }

    // Mark Notification as read
    if (action === 'read_notification') {
      const notifId = Number(req.body?.id || req.query.id);
      if (notifId) {
        await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [notifId]);
      }
      return res.json({ success: true, data: { id: notifId } });
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

export default router;
