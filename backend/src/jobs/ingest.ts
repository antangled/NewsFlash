import { TRACKED_ACCOUNTS } from '../accounts/whitelist';
import { fetchAccountTimeline } from '../utils/twitter-client';
import { insertRawTweet } from '../db/queries';

export async function ingestAllAccounts(date: string): Promise<number> {
  const now = new Date().toISOString();
  let totalIngested = 0;

  for (const account of TRACKED_ACCOUNTS) {
    const tweets = await fetchAccountTimeline(account);

    for (const tweet of tweets) {
      insertRawTweet({
        id: tweet.id,
        account_handle: account.handle,
        account_name: account.name,
        account_tier: account.tier,
        content: tweet.content,
        posted_at: tweet.posted_at,
        fetched_at: now,
        fetch_date: date,
      });
      totalIngested++;
    }

    // Small delay between accounts to be polite to RSSHub
    await new Promise(r => setTimeout(r, 200));
  }

  return totalIngested;
}
