import cron from 'node-cron';
import { runPipeline } from './pipeline';

export function startScheduler(): void {
  // Run at 6 AM UTC (catches US evening tweets)
  cron.schedule('0 6 * * *', () => {
    console.log('[Scheduler] Running 6 AM UTC pipeline...');
    runPipeline().catch(err => console.error('[Scheduler] Pipeline failed:', err));
  });

  // Run at 12 PM UTC (catches overnight global tweets)
  cron.schedule('0 12 * * *', () => {
    console.log('[Scheduler] Running 12 PM UTC pipeline...');
    runPipeline().catch(err => console.error('[Scheduler] Pipeline failed:', err));
  });

  console.log('[Scheduler] Cron jobs scheduled: 6 AM UTC, 12 PM UTC');
}
