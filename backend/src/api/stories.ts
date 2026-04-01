import { Request, Response } from 'express';
import { getStoriesByDate } from '../db/queries';

const FREE_STORY_LIMIT = 5;
const PRO_STORY_LIMIT = 10;

export function getStoriesToday(req: Request, res: Response): void {
  const date = new Date().toISOString().split('T')[0];
  const tier = (req.headers['x-newsflash-tier'] as string) || 'free';
  const limit = tier === 'pro' ? PRO_STORY_LIMIT : FREE_STORY_LIMIT;

  const stories = getStoriesByDate(date);
  const limited = stories.slice(0, limit);

  const formatted = limited.map((s) => ({
    id: s.id,
    rank: s.rank,
    headline: s.headline,
    detail: s.detail,
    sources: parseSourceHandles(s.source_handles),
    cluster_score: s.cluster_score,
  }));

  res.json({
    date,
    tier,
    stories: formatted,
    totalAvailable: stories.length,
    generated_at: stories.length > 0 ? stories[0].created_at : null,
  });
}

export function getStoriesArchive(req: Request, res: Response): void {
  const tier = (req.headers['x-newsflash-tier'] as string) || 'free';

  if (tier !== 'pro') {
    res.status(403).json({
      error: 'Archive access requires Pro tier',
      upgrade: true,
    });
    return;
  }

  const date = (req.params as { date?: string }).date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    return;
  }

  const stories = getStoriesByDate(date);
  const formatted = stories.map((s) => ({
    id: s.id,
    rank: s.rank,
    headline: s.headline,
    detail: s.detail,
    sources: parseSourceHandles(s.source_handles),
    cluster_score: s.cluster_score,
  }));

  res.json({
    date,
    tier,
    stories: formatted,
    generated_at: stories.length > 0 ? stories[0].created_at : null,
  });
}

function parseSourceHandles(json: string): { handle: string }[] {
  try {
    const handles = JSON.parse(json) as string[];
    return handles.map((h) => ({ handle: h }));
  } catch {
    return [];
  }
}
