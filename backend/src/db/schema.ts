import { getDb } from './connection';

export function initSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_tweets (
      id TEXT PRIMARY KEY,
      account_handle TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_tier INTEGER NOT NULL,
      content TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      fetch_date TEXT NOT NULL,
      filtered_out INTEGER DEFAULT 0,
      score REAL DEFAULT 0,
      cluster_id TEXT
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      headline TEXT NOT NULL,
      detail TEXT,
      source_handles TEXT NOT NULL,
      source_tweet_ids TEXT NOT NULL,
      cluster_score REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stories_date ON stories(date);
    CREATE INDEX IF NOT EXISTS idx_raw_tweets_fetch_date ON raw_tweets(fetch_date);
  `);
}
