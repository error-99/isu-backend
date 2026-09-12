import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { exportDatabaseSqlFile, getMySqlPool, isMySqlConfigured, logDatabaseError } from './backend/db';
import apiRouter from './backend/routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable CORS for external frontends or cross-origin calls
  app.use(cors());

  // JSON request body parser
  app.use(express.json());

  // 1. Initialize Aiven MySQL connection exclusively
  console.log('🔌 Connecting exclusively to Aiven Cloud MySQL (defaultdb)...');
  getMySqlPool().then((pool) => {
    if (pool) {
      console.log('🚀 Aiven Cloud MySQL is connected and operational.');
    }
  }).catch((err) => {
    console.error('⚠️ Aiven MySQL connection issue:', err?.message || err);
  });

  // 3. Mount all Backend API Routes under /api
  app.use('/api', apiRouter);

  // 4. Vite middleware for frontend (frontend/) development vs production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      root: path.resolve(__dirname, 'frontend'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Routine App Server running on http://localhost:${PORT}`);
    console.log(`📦 Backend API mounted at /api`);
    console.log(`🎨 Frontend UI served from /src`);
  });
}

startServer();
