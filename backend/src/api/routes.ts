import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { getStoriesToday, getStoriesArchive } from './stories';
import { runPipeline } from '../jobs/pipeline';
import {
  getTwitterAuthUrl,
  handleTwitterCallback,
  exchangeTwitterToken,
  pollTwitterAuth,
  disconnectTwitter,
  getPersonalStories,
} from './auth';

const router = Router();

// Simple API key check
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-newsflash-key'];
  if (key !== config.newsflashApiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  next();
}

// Free tier: today's stories (max 5)
router.get('/api/stories/today', authMiddleware, getStoriesToday);

// Pro tier: specific date stories (archive access)
router.get('/api/stories/archive/:date', authMiddleware, getStoriesArchive);

// Manual pipeline trigger (useful for testing without waiting for cron)
router.post('/api/pipeline/run', authMiddleware, (_req: Request, res: Response) => {
  console.log('[API] Manual pipeline trigger requested');
  // Run pipeline in background so the request returns immediately
  runPipeline()
    .then(() => {
      console.log('[API] Manual pipeline run completed successfully');
    })
    .catch((err) => {
      console.error('[API] Manual pipeline run failed:', (err as Error).message);
    });
  res.json({ status: 'started', message: 'Pipeline started in background. Check server logs for progress.' });
});

// Twitter OAuth routes (no API key auth — these use OAuth)
router.get('/api/auth/twitter', getTwitterAuthUrl);
router.get('/api/auth/twitter/callback', handleTwitterCallback);
router.post('/api/auth/twitter/token', exchangeTwitterToken);
router.get('/api/auth/twitter/poll', pollTwitterAuth);
router.post('/api/auth/twitter/disconnect', disconnectTwitter);

// Personal stories (uses Twitter bearer token, not API key)
router.get('/api/stories/personal', getPersonalStories);

// Health check (no auth needed)
router.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tier info endpoint
router.get('/api/tier/info', (_req: Request, res: Response) => {
  res.json({
    tiers: {
      free: {
        name: 'Free',
        price: 0,
        features: [
          '5 daily headlines',
          'Expand for details',
          'Source attribution',
          'Bottom bar delivery',
        ],
        storiesPerDay: 5,
      },
      pro: {
        name: 'Pro',
        price: 4.99,
        priceAnnual: 39,
        features: [
          '7+ daily headlines',
          'Breaking news alerts',
          'Topic customization',
          '30-day archive',
          '4x daily updates',
          'Weekly recap digest',
        ],
        storiesPerDay: 10,
      },
    },
  });
});

export default router;
