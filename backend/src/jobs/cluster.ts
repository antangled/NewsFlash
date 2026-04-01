import { RawTweet, updateTweetCluster, updateTweetScore } from '../db/queries';
import { generateJson } from '../utils/llm-client';

export interface Cluster {
  cluster_id: string;
  tweet_ids: string[];
  primary_topic: string;
}

export interface ScoredCluster extends Cluster {
  tweets: RawTweet[];
  aggregateScore: number;
}

export async function clusterTweets(tweets: RawTweet[]): Promise<ScoredCluster[]> {
  if (tweets.length === 0) return [];

  // Take top 50 by score for clustering
  const top = [...tweets].sort((a, b) => b.score - a.score).slice(0, 50);

  const tweetList = top.map((t, i) =>
    `${i + 1}. [id: ${t.id}] @${t.account_handle}: "${t.content.slice(0, 200)}"`
  ).join('\n');

  const prompt = `Group these tweets into clusters where each cluster represents ONE news event or topic.
Tweets about the same announcement, product, event, or story should be in the same cluster.
If a tweet is unique and doesn't relate to others, put it in its own cluster.

Tweets:
${tweetList}

Return ONLY a JSON array:
[{"cluster_id": "short-descriptive-id", "tweet_ids": ["id1", "id2"], "primary_topic": "Brief description of the event"}]`;

  let clusters: Cluster[];
  try {
    const result = await generateJson(prompt);
    clusters = Array.isArray(result) ? result as Cluster[] : [];
  } catch (err) {
    console.error('[Cluster] LLM clustering failed:', (err as Error).message);
    // Fallback: each tweet is its own cluster
    clusters = top.map(t => ({
      cluster_id: t.id,
      tweet_ids: [t.id],
      primary_topic: t.content.slice(0, 80),
    }));
  }

  // Build tweet lookup
  const tweetMap = new Map(top.map(t => [t.id, t]));

  // Score clusters and apply cross-source confirmation
  const scored: ScoredCluster[] = clusters.map(cluster => {
    const clusterTweets = cluster.tweet_ids
      .map(id => tweetMap.get(id))
      .filter((t): t is RawTweet => t !== undefined);

    // Cross-source confirmation based on unique accounts
    const uniqueAccounts = new Set(clusterTweets.map(t => t.account_handle));
    const crossSourceScore = uniqueAccounts.size >= 3 ? 1.0 : uniqueAccounts.size === 2 ? 0.5 : 0.0;

    // Recalculate scores with cross-source factor
    for (const tweet of clusterTweets) {
      const newScore = tweet.score + (crossSourceScore * 0.10);
      tweet.score = newScore;
      updateTweetScore(tweet.id, newScore);
      updateTweetCluster(tweet.id, cluster.cluster_id);
    }

    // Aggregate score = max tweet score in cluster (prioritize the strongest signal)
    const aggregateScore = clusterTweets.length > 0
      ? Math.max(...clusterTweets.map(t => t.score))
      : 0;

    return {
      ...cluster,
      tweets: clusterTweets,
      aggregateScore,
    };
  });

  return scored.sort((a, b) => b.aggregateScore - a.aggregateScore);
}
