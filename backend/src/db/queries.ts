import { getDb } from './connection';

export interface RawTweet {
  id: string;
  account_handle: string;
  account_name: string;
  account_tier: number;
  content: string;
  posted_at: string;
  fetched_at: string;
  fetch_date: string;
  filtered_out: number;
  score: number;
  cluster_id: string | null;
}

export interface Story {
  id: string;
  date: string;
  rank: number;
  headline: string;
  detail: string | null;
  source_handles: string;
  source_tweet_ids: string;
  cluster_score: number;
  created_at: string;
}

export function insertRawTweet(tweet: Omit<RawTweet, 'filtered_out' | 'score' | 'cluster_id'>): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO raw_tweets (id, account_handle, account_name, account_tier, content, posted_at, fetched_at, fetch_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tweet.id, tweet.account_handle, tweet.account_name, tweet.account_tier, tweet.content, tweet.posted_at, tweet.fetched_at, tweet.fetch_date);
}

export function getTweetsByDate(date: string): RawTweet[] {
  const db = getDb();
  return db.prepare('SELECT * FROM raw_tweets WHERE fetch_date = ?').all(date) as RawTweet[];
}

export function getUnfilteredTweetsByDate(date: string): RawTweet[] {
  const db = getDb();
  return db.prepare('SELECT * FROM raw_tweets WHERE fetch_date = ? AND filtered_out = 0').all(date) as RawTweet[];
}

export function markFiltered(tweetId: string): void {
  const db = getDb();
  db.prepare('UPDATE raw_tweets SET filtered_out = 1 WHERE id = ?').run(tweetId);
}

export function updateTweetScore(tweetId: string, score: number): void {
  const db = getDb();
  db.prepare('UPDATE raw_tweets SET score = ? WHERE id = ?').run(score, tweetId);
}

export function updateTweetCluster(tweetId: string, clusterId: string): void {
  const db = getDb();
  db.prepare('UPDATE raw_tweets SET cluster_id = ? WHERE id = ?').run(clusterId, tweetId);
}

export function insertStory(story: Story): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO stories (id, date, rank, headline, detail, source_handles, source_tweet_ids, cluster_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(story.id, story.date, story.rank, story.headline, story.detail, story.source_handles, story.source_tweet_ids, story.cluster_score, story.created_at);
}

export function getStoriesByDate(date: string): Story[] {
  const db = getDb();
  return db.prepare('SELECT * FROM stories WHERE date = ? ORDER BY rank ASC').all(date) as Story[];
}

export function deleteOldData(daysToKeep: number): void {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  db.prepare('DELETE FROM raw_tweets WHERE fetch_date < ?').run(cutoffStr);
  db.prepare('DELETE FROM stories WHERE date < ?').run(cutoffStr);
}
