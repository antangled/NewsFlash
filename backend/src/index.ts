import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initSchema } from './db/schema';
import { seedTodayStories } from './db/seed';
import { startScheduler } from './jobs/scheduler';
import routes from './api/routes';

const app = express();

// CORS: allow Chrome extensions
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile, curl, etc.) and chrome extensions
    if (!origin || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for MVP; tighten later
    }
  },
}));

app.use(express.json());
app.use(routes);

// Initialize database and seed if empty
initSchema();
seedTodayStories();
console.log('[Server] Database initialized');

// Start cron scheduler
startScheduler();

// Start server
app.listen(config.port, () => {
  console.log(`[Server] NewsFlash backend running on port ${config.port}`);
});
