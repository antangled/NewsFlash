import Parser from 'rss-parser';
import { config } from '../config';
import { TrackedAccount } from '../accounts/whitelist';

const parser = new Parser();

export interface FetchedTweet {
  id: string;
  content: string;
  posted_at: string;
  link: string;
}

export async function fetchAccountTimeline(account: TrackedAccount): Promise<FetchedTweet[]> {
  const feedUrl = `${config.rsshubBaseUrl}/twitter/user/${account.handle}`;

  try {
    const feed = await parser.parseURL(feedUrl);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return (feed.items || [])
      .filter(item => {
        if (!item.isoDate) return false;
        const postDate = new Date(item.isoDate);
        return postDate >= oneDayAgo;
      })
      .map(item => ({
        id: item.guid || item.link || `${account.handle}-${item.isoDate}`,
        content: stripHtml(item.contentSnippet || item.title || ''),
        posted_at: item.isoDate || new Date().toISOString(),
        link: item.link || '',
      }));
  } catch (err) {
    console.error(`[Twitter] Failed to fetch @${account.handle}: ${(err as Error).message}`);
    return [];
  }
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}
