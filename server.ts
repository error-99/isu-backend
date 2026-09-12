import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import { getMySqlPool, getDatabaseStatus } from './db';
import apiRouter from './routes';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// Enable Cross-Origin Resource Sharing (CORS) so any frontend domain can connect
app.use(
  cors({
    origin: true, // Echoes back the request origin to satisfy browser credentials mode
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cache-Control', 'Pragma'],
    credentials: true,
  })
);

// Body parser
app.use(express.json());

// Server root status endpoint
app.get('/', async (req, res) => {
  const dbStatus = await getDatabaseStatus();
  res.json({
    status: 'online',
    name: 'ISU Student Routine Portal API Server',
    version: '1.0.0',
    documentation: '/api/health',
    database: {
      connected: dbStatus.connected,
      host: dbStatus.host,
      database: dbStatus.database,
    },
    cors: 'Enabled (all origins)',
    timestamp: new Date().toISOString(),
  });
});

// Mount all backend API routes under /api
app.use('/api', apiRouter);

// Initialize database connection on startup
getMySqlPool()
  .then((pool) => {
    if (pool) {
      console.log('🚀 MySQL Database connection established successfully.');
    }
  })
  .catch((err) => {
    console.error('⚠️ Initial MySQL connection issue:', err?.message || err);
  });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 ISU Routine Backend Server is running!`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📡 API Endpoints: http://localhost:${PORT}/api`);
  console.log(`🩺 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
});

export default app;
