import { RawTweet, getUnfilteredTweetsByDate, updateTweetScore } from '../db/queries';
import { getTierScore } from '../accounts/whitelist';
import { generateJson } from '../utils/llm-client';

const EVENT_SCORES: Record<string, number> = {
  launch: 0.95,
  funding: 0.90,
  acquisition: 0.90,
  partnership: 0.85,
  product_release: 0.85,
  policy_regulation: 0.80,
  infrastructure_capability: 0.80,
  pricing_change: 0.75,
  hiring_signal: 0.65,
  commentary: 0.40,
  general_take: 0.20,
  other: 0.10,
};

interface EventClassification {
  tweet_id: string;
  event_type: string;
  score: number;
}

export async function scoreTweets(date: string): Promise<RawTweet[]> {
  const tweets = getUnfilteredTweetsByDate(date);
  if (tweets.length === 0) return [];

  // Classify event types in batches of 15
  const eventScores = new Map<string, number>();
  const batchSize = 15;

  for (let i = 0; i < tweets.length; i += batchSize) {
    const batch = tweets.slice(i, i + batchSize);
    const classifications = await classifyBatch(batch);

    for (const c of classifications) {
      eventScores.set(c.tweet_id, c.score);
    }

    // Rate limit: wait between batches
    if (i + batchSize < tweets.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Calculate final scores
  for (const tweet of tweets) {
    const sourceScore = getTierScore(tweet.account_tier as 1 | 2 | 3);
    const eventScore = eventScores.get(tweet.id) || 0.10;
    // Cross-source applied later after clustering
    const total = (sourceScore * 0.50) + (eventScore * 0.40);
    tweet.score = total;
    updateTweetScore(tweet.id, total);
  }

  return tweets;
}

async function classifyBatch(tweets: RawTweet[]): Promise<EventClassification[]> {
  const tweetList = tweets.map((t, i) =>
    `${i + 1}. [id: ${t.id}] @${t.account_handle}: "${t.content.slice(0, 200)}"`
  ).join('\n');

  const prompt = `Classify each tweet into ONE event type. Return ONLY a JSON array.

Event types and their scores:
- launch (0.95): new product, feature, or service launch
- funding (0.90): fundraising, investment rounds
- acquisition (0.90): company acquisitions, mergers
- partnership (0.85): deals, collaborations between companies
- product_release (0.85): updates, new versions, open-source releases
- policy_regulation (0.80): government, legal, regulatory news
- infrastructure_capability (0.80): technical breakthroughs, benchmarks
- pricing_change (0.75): price changes, new tiers, business model shifts
- hiring_signal (0.65): major hires, team changes, layoffs
- commentary (0.40): opinions, analysis on existing news
- general_take (0.20): general thoughts, motivational, vague posts
- other (0.10): doesn't fit any category

Tweets:
${tweetList}

Return JSON array:
[{"tweet_id": "...", "event_type": "...", "score": 0.XX}]`;

  try {
    const result = await generateJson(prompt) as EventClassification[];
    return Array.isArray(result) ? result : [];
  } catch (err) {
    console.error('[Score] LLM classification failed:', (err as Error).message);
    // Fallback: assign default scores
    return tweets.map(t => ({ tweet_id: t.id, event_type: 'other', score: 0.10 }));
  }
}
