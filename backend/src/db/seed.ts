import { v4 as uuidv4 } from 'uuid';
import { initSchema } from './schema';
import { insertStory, getStoriesByDate } from './queries';

const SEED_STORIES = [
  {
    headline: 'OpenAI launches GPT-5 with real-time reasoning capabilities',
    detail: 'The new model demonstrates significant improvements in multi-step reasoning and can process real-time data streams. OpenAI claims a 3x improvement in complex task completion over GPT-4o.',
    sources: ['sama', 'OpenAI', 'rowancheung'],
    score: 0.97,
  },
  {
    headline: 'Anthropic raises $5B Series D at $60B valuation',
    detail: 'The round was led by Lightspeed Venture Partners with participation from Google and Spark Capital. The funding will accelerate Claude model development and enterprise deployment.',
    sources: ['DarioAmodei', 'AnthropicAI', 'theinformation'],
    score: 0.94,
  },
  {
    headline: 'NVIDIA unveils Blackwell Ultra GPU with 2x inference throughput',
    detail: 'Jensen Huang announced the next-generation chip at GTC, promising dramatic cost reductions for AI inference workloads. Major cloud providers are already placing orders for H200 successors.',
    sources: ['JensenHuang', 'nvidia', 'kylewiggers'],
    score: 0.92,
  },
  {
    headline: 'Apple acquires AI startup for $2B to boost Siri intelligence',
    detail: 'The acquisition targets on-device language model capabilities for iOS 20. Sources say the deal closed last week and will integrate 200 ML engineers into Apple\'s AI division.',
    sources: ['markgurman', 'Apple', 'TechCrunch'],
    score: 0.89,
  },
  {
    headline: 'Stripe launches AI-powered fraud detection reducing false declines 40%',
    detail: 'The new system uses transaction graph neural networks trained on Stripe\'s massive payment dataset. Patrick Collison called it "the biggest improvement to payment acceptance in a decade."',
    sources: ['patrickc', 'stripe', 'levelsio'],
    score: 0.85,
  },
];

export function seedTodayStories(): void {
  const today = new Date().toISOString().split('T')[0];

  // Don't seed if stories already exist for today
  const existing = getStoriesByDate(today);
  if (existing.length > 0) {
    console.log('[Seed] Stories already exist for today, skipping seed.');
    return;
  }

  console.log('[Seed] Seeding sample stories for', today);

  for (let i = 0; i < SEED_STORIES.length; i++) {
    const s = SEED_STORIES[i];
    insertStory({
      id: uuidv4(),
      date: today,
      rank: i + 1,
      headline: s.headline,
      detail: s.detail,
      source_handles: JSON.stringify(s.sources),
      source_tweet_ids: JSON.stringify([]),
      cluster_score: s.score,
      created_at: new Date().toISOString(),
    });
  }

  console.log(`[Seed] Inserted ${SEED_STORIES.length} sample stories.`);
}

// Allow running directly: npx ts-node src/db/seed.ts
if (require.main === module) {
  initSchema();
  seedTodayStories();
  console.log('[Seed] Done.');
}
