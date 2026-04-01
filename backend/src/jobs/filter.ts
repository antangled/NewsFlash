import { RawTweet, getTweetsByDate, markFiltered } from '../db/queries';

export function filterTweets(date: string): { passed: number; filtered: number } {
  const tweets = getTweetsByDate(date);
  let filtered = 0;

  for (const tweet of tweets) {
    if (shouldFilter(tweet)) {
      markFiltered(tweet.id);
      filtered++;
    }
  }

  return { passed: tweets.length - filtered, filtered };
}

function shouldFilter(tweet: RawTweet): boolean {
  const text = tweet.content.trim();

  // Remove pure replies
  if (text.startsWith('@')) return true;

  // Remove retweets
  if (text.startsWith('RT @')) return true;

  // Remove very short tweets (likely reactions/memes)
  if (text.length < 30) return true;

  // Remove hashtag-heavy tweets
  const words = text.split(/\s+/);
  const hashtags = words.filter(w => w.startsWith('#'));
  if (words.length > 0 && hashtags.length / words.length > 0.5) return true;

  // Remove tweets that are mostly links
  const links = words.filter(w => w.startsWith('http'));
  const nonLinkWords = words.length - links.length;
  if (nonLinkWords < 3) return true;

  return false;
}
