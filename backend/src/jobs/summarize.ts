import { v4 as uuidv4 } from 'uuid';
import { ScoredCluster } from './cluster';
import { insertStory } from '../db/queries';
import { generateJson } from '../utils/llm-client';

interface GeneratedSummary {
  headline: string;
  detail: string;
}

export async function summarizeClusters(date: string, clusters: ScoredCluster[]): Promise<void> {
  // Take top 7 clusters
  const top = clusters.slice(0, 7);

  for (let i = 0; i < top.length; i++) {
    const cluster = top[i];
    const summary = await summarizeCluster(cluster);

    const sourceHandles = [...new Set(cluster.tweets.map(t => t.account_handle))];
    const sourceTweetIds = cluster.tweets.map(t => t.id);

    insertStory({
      id: uuidv4(),
      date,
      rank: i + 1,
      headline: summary.headline,
      detail: summary.detail,
      source_handles: JSON.stringify(sourceHandles),
      source_tweet_ids: JSON.stringify(sourceTweetIds),
      cluster_score: cluster.aggregateScore,
      created_at: new Date().toISOString(),
    });

    // Rate limit between summarization calls
    if (i < top.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

async function summarizeCluster(cluster: ScoredCluster): Promise<GeneratedSummary> {
  const tweetTexts = cluster.tweets.map(t =>
    `@${t.account_handle}: "${t.content.slice(0, 300)}"`
  ).join('\n');

  const prompt = `You are a concise tech news editor. Given tweets about a single topic, write:
1. A headline: one line, max 80 characters, no source attribution, news ticker style, present tense.
2. A detail: exactly 2 sentences expanding on the headline with the most important specifics.

Topic: ${cluster.primary_topic}

Tweets:
${tweetTexts}

Return ONLY JSON:
{"headline": "...", "detail": "..."}`;

  try {
    const result = await generateJson(prompt) as GeneratedSummary;
    return {
      headline: (result.headline || cluster.primary_topic).slice(0, 100),
      detail: result.detail || '',
    };
  } catch (err) {
    console.error('[Summarize] LLM failed:', (err as Error).message);
    // Fallback: use the primary topic as headline
    return {
      headline: cluster.primary_topic.slice(0, 100),
      detail: cluster.tweets[0]?.content.slice(0, 200) || '',
    };
  }
}
