import { initSchema } from '../db/schema';
import { ingestAllAccounts } from './ingest';
import { filterTweets } from './filter';
import { scoreTweets } from './score';
import { clusterTweets } from './cluster';
import { summarizeClusters } from './summarize';
import { getUnfilteredTweetsByDate, deleteOldData } from '../db/queries';

export async function runPipeline(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[Pipeline] Starting for ${today}`);

  // Ensure DB is ready
  initSchema();

  // Step 1: Ingest
  console.log('[Pipeline] Step 1: Ingesting tweets...');
  const ingested = await ingestAllAccounts(today);
  console.log(`[Pipeline] Ingested ${ingested} tweets`);

  if (ingested === 0) {
    console.log('[Pipeline] No tweets ingested. Aborting.');
    return;
  }

  // Step 2: Filter
  console.log('[Pipeline] Step 2: Filtering...');
  const { passed, filtered } = filterTweets(today);
  console.log(`[Pipeline] ${passed} passed, ${filtered} filtered out`);

  if (passed === 0) {
    console.log('[Pipeline] No tweets passed filtering. Aborting.');
    return;
  }

  // Step 3: Score
  console.log('[Pipeline] Step 3: Scoring...');
  const scored = await scoreTweets(today);
  console.log(`[Pipeline] Scored ${scored.length} tweets`);

  // Step 4: Cluster
  console.log('[Pipeline] Step 4: Clustering...');
  const clusters = await clusterTweets(scored);
  console.log(`[Pipeline] Found ${clusters.length} clusters`);

  // Step 5: Summarize and store
  console.log('[Pipeline] Step 5: Summarizing...');
  await summarizeClusters(today, clusters);
  console.log(`[Pipeline] Stored top stories for ${today}`);

  // Cleanup old data (keep 7 days)
  deleteOldData(7);
  console.log('[Pipeline] Cleanup complete. Pipeline done.');
}

// Allow running directly: npx ts-node src/jobs/pipeline.ts
if (require.main === module) {
  runPipeline()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Pipeline] Fatal error:', err);
      process.exit(1);
    });
}
