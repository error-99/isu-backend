# 🚀 ISU Routine & Student Portal - Backend API Server

This folder contains the complete, standalone backend Node.js & Express API server with direct MySQL database support, bcrypt password encryption, and full CORS support for remote frontends.

---

## 📁 Folder Contents
- `server.ts`: Express application entry point with CORS enabled
- `routes.ts`: Complete REST API endpoints (`/api/register`, `/api/login`, `/api/user`, `/api/departments`, `/api/semesters`, etc.)
- `db.ts`: MySQL connection pool with automatic retry, SSL support, and query handlers
- `auth.ts`: Bcrypt password hashing and verification
- `database.sql`: Full SQL dump containing all tables, initial routines, semesters, departments, and course data
- `package.json`: Node dependencies and build scripts
- `.env.example`: Template for environment variables

---

## ⚙️ Quick Start (Local)

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your MySQL credentials:
   ```bash
   cp .env.example .env
   ```

3. **Import Database**:
   Import `database.sql` into your MySQL server (via phpMyAdmin, MySQL Workbench, or CLI):
   ```bash
   mysql -u username -p database_name < database.sql
   ```

4. **Run Server**:
   - For development:
     ```bash
     npm run dev
     ```
   - For production:
     ```bash
     npm run build
     npm start
     ```
   The server will start at `http://localhost:5000` (or the port specified in `.env`).

---

## 🌐 Deploying to Another Server

### 1. Deploying to Render (Web Service)
1. Push this `backend/` folder to GitHub.
2. In [Render Dashboard](https://render.com), click **New +** -> **Web Service**.
3. Select your repository.
4. Set:
   - **Root Directory**: `backend` (or leave root if repo is just this folder)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `PORT`: `10000` (Render's default)
   - `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_PORT`
6. Click **Deploy**.
7. Copy your backend URL (e.g. `https://isu-routine-backend.onrender.com`).
8. Add this URL to your frontend via `VITE_API_URL` or directly in the frontend UI settings!

### 2. Deploying to Railway.app
1. Click **New Project** -> **Deploy from GitHub repo**.
2. Set Root Directory to `/backend`.
3. Add environment variables in the Railway dashboard.
4. Generate a public domain under Settings -> Networking.

### 3. Deploying to a Linux VPS (Ubuntu / Debian)
1. Upload the `backend/` folder to your server (e.g. `/var/www/isu-backend`).
2. Install dependencies:
   ```bash
   cd /var/www/isu-backend
   npm install
   npm run build
   ```
3. Run with PM2:
   ```bash
   npm install -g pm2
   pm2 start dist/server.cjs --name "isu-backend"
   pm2 startup
   pm2 save
   ```
4. Set up Nginx reverse proxy with SSL (Let's Encrypt / Certbot).

---

## 📡 API Endpoints

- `GET /`: Health & server status
- `GET /api/health`: Database connection status & latency
- `POST /api/register`: Student registration
- `POST /api/login`: Student login & token generation
- `GET /api/departments`: List of departments
- `GET /api/semesters`: List of semesters
- `GET/POST /api/user?action=...`:
  - `action=me`: Get authenticated student profile
  - `action=courses`: Get enrolled courses
  - `action=available_courses`: Get department courses
  - `action=add_course`: Enroll in course
  - `action=remove_course`: Drop course
  - `action=routine`: Get daily class routine
  - `action=ct`: Get Class Tests (CTs)
  - `action=exams`: Get Midterm / Final exams
  - `action=notifications`: Get announcements
  - `action=change_password`: Change password
