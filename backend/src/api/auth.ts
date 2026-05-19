import { Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';

// In-memory store for OAuth state and PKCE verifiers
const oauthSessions: Map<string, { codeVerifier: string; createdAt: number }> = new Map();

// Store completed auth results so the desktop app can poll for them
const completedAuths: Map<string, { handle: string; accessToken: string; refreshToken: string | null }> = new Map();

// Clean up stale sessions older than 10 minutes
function cleanStaleSessions(): void {
  const now = Date.now();
  for (const [key, session] of oauthSessions) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      oauthSessions.delete(key);
    }
  }
}

// Generate a random Base64-URL string
function generateRandom(length: number): string {
  return crypto.randomBytes(length).toString('base64url');
}

// Generate PKCE code challenge from verifier
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * GET /api/auth/twitter
 * Generates Twitter OAuth 2.0 PKCE authorization URL
 */
export function getTwitterAuthUrl(_req: Request, res: Response): void {
  cleanStaleSessions();

  if (!config.twitterClientId) {
    res.status(500).json({ error: 'Twitter client ID not configured' });
    return;
  }

  const state = generateRandom(32);
  const codeVerifier = generateRandom(64);
  const codeChallenge = generateCodeChallenge(codeVerifier);

  oauthSessions.set(state, { codeVerifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.twitterClientId,
    redirect_uri: config.twitterCallbackUrl,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const url = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  res.json({ url });
}

/**
 * GET /api/auth/twitter/callback
 * Handles the OAuth callback from Twitter. Renders an HTML page that
 * passes the authorization code and state back so the extension can
 * exchange it for tokens.
 */
export async function handleTwitterCallback(req: Request, res: Response): Promise<void> {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    res.status(400).send(callbackPage(false, `Twitter authorization denied: ${error}`));
    return;
  }

  if (!code || !state) {
    res.status(400).send(callbackPage(false, 'Missing code or state parameter'));
    return;
  }

  const session = oauthSessions.get(state);
  if (!session) {
    res.status(400).send(callbackPage(false, 'Invalid or expired state. Please try again.'));
    return;
  }

  // Exchange the code for tokens immediately
  const { codeVerifier } = session;
  oauthSessions.delete(state);

  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.twitterCallbackUrl,
      client_id: config.twitterClientId,
      code_verifier: codeVerifier,
    });

    const basicAuth = Buffer.from(
      `${config.twitterClientId}:${config.twitterClientSecret}`
    ).toString('base64');

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[Auth] Callback token exchange failed:', tokenRes.status, errBody);
      res.status(400).send(callbackPage(false, 'Failed to exchange token with Twitter.'));
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    // Fetch user info
    const userRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    let handle = 'unknown';
    if (userRes.ok) {
      const userData = (await userRes.json()) as { data: { username: string } };
      handle = userData.data.username;
    }

    // Store result so the desktop app can poll for it
    completedAuths.set(state, {
      handle,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
    });

    // Clean up after 5 minutes
    setTimeout(() => completedAuths.delete(state), 5 * 60 * 1000);

    res.send(callbackPage(true, '', undefined, undefined, handle));
  } catch (err) {
    console.error('[Auth] Callback exchange error:', err);
    res.status(500).send(callbackPage(false, 'Internal error during authentication.'));
  }
}

/**
 * POST /api/auth/twitter/token
 * Extension sends the authorization code; backend exchanges it for tokens.
 * Body: { code: string, state: string }
 */
export async function exchangeTwitterToken(req: Request, res: Response): Promise<void> {
  const { code, state } = req.body as { code?: string; state?: string };

  if (!code || !state) {
    res.status(400).json({ error: 'Missing code or state' });
    return;
  }

  const session = oauthSessions.get(state);
  if (!session) {
    res.status(400).json({ error: 'Invalid or expired state. Please re-authenticate.' });
    return;
  }

  const { codeVerifier } = session;
  oauthSessions.delete(state);

  try {
    // Exchange authorization code for access token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.twitterCallbackUrl,
      client_id: config.twitterClientId,
      code_verifier: codeVerifier,
    });

    const basicAuth = Buffer.from(
      `${config.twitterClientId}:${config.twitterClientSecret}`
    ).toString('base64');

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[Auth] Token exchange failed:', tokenRes.status, errBody);
      res.status(502).json({ error: 'Failed to exchange token with Twitter' });
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
      expires_in: number;
    };

    // Fetch user info
    const userRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      const errBody = await userRes.text();
      console.error('[Auth] User info fetch failed:', userRes.status, errBody);
      res.status(502).json({ error: 'Failed to fetch user info from Twitter' });
      return;
    }

    const userData = (await userRes.json()) as {
      data: { id: string; username: string; name: string };
    };

    res.json({
      handle: userData.data.username,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresIn: tokenData.expires_in,
    });
  } catch (err) {
    console.error('[Auth] Token exchange error:', err);
    res.status(500).json({ error: 'Internal error during token exchange' });
  }
}

/**
 * POST /api/auth/twitter/disconnect
 * Clears any server-side state for the user's Twitter connection.
 * Currently a no-op since tokens are stored client-side, but provides
 * a hook for future server-side token revocation.
 */
/**
 * GET /api/auth/twitter/poll?state=...
 * Desktop app polls this to check if the browser OAuth flow completed.
 */
export function pollTwitterAuth(req: Request, res: Response): void {
  const state = req.query.state as string | undefined;
  if (!state) {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  const result = completedAuths.get(state);
  if (result) {
    completedAuths.delete(state);
    res.json({ ok: true, ...result });
  } else {
    res.json({ ok: false, pending: true });
  }
}

export function disconnectTwitter(_req: Request, res: Response): void {
  // In the future, revoke the token with Twitter's API:
  // POST https://api.twitter.com/2/oauth2/revoke
  res.json({ ok: true });
}

/**
 * GET /api/stories/personal
 * Fetches the user's home timeline using their Twitter access token,
 * then runs it through the scoring/clustering pipeline.
 */
export async function getPersonalStories(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.json({
      fallback: true,
      reason: 'No Twitter token provided',
      stories: [],
      date: new Date().toISOString().split('T')[0],
    });
    return;
  }

  try {
    // Fetch user's reverse-chronological home timeline
    const timelineRes = await fetch(
      'https://api.twitter.com/2/users/me/timelines/reverse_chronological?' +
        new URLSearchParams({
          max_results: '50',
          'tweet.fields': 'created_at,public_metrics,author_id,text',
          expansions: 'author_id',
          'user.fields': 'username,name',
        }).toString(),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (timelineRes.status === 401 || timelineRes.status === 403) {
      res.json({
        fallback: true,
        reason: 'Twitter token expired',
        stories: [],
        date: new Date().toISOString().split('T')[0],
      });
      return;
    }

    if (!timelineRes.ok) {
      const errBody = await timelineRes.text();
      console.error('[PersonalStories] Timeline fetch failed:', timelineRes.status, errBody);
      res.json({
        fallback: true,
        reason: 'Failed to fetch timeline from Twitter',
        stories: [],
        date: new Date().toISOString().split('T')[0],
      });
      return;
    }

    const timeline = (await timelineRes.json()) as {
      data?: Array<{
        id: string;
        text: string;
        author_id: string;
        created_at: string;
        public_metrics?: {
          retweet_count: number;
          like_count: number;
          reply_count: number;
        };
      }>;
      includes?: {
        users?: Array<{ id: string; username: string; name: string }>;
      };
    };

    if (!timeline.data || timeline.data.length === 0) {
      res.json({
        date: new Date().toISOString().split('T')[0],
        stories: [],
        totalAvailable: 0,
      });
      return;
    }

    // Build a quick user lookup
    const userMap = new Map<string, string>();
    if (timeline.includes?.users) {
      for (const u of timeline.includes.users) {
        userMap.set(u.id, u.username);
      }
    }

    // Simple scoring: rank tweets by engagement (likes + retweets * 2)
    const scored = timeline.data
      .map((tweet) => {
        const metrics = tweet.public_metrics || { like_count: 0, retweet_count: 0, reply_count: 0 };
        const score = metrics.like_count + metrics.retweet_count * 2 + metrics.reply_count * 0.5;
        return { tweet, score, handle: userMap.get(tweet.author_id) || 'unknown' };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const stories = scored.map((item, index) => ({
      rank: index + 1,
      headline: item.tweet.text.slice(0, 200),
      detail: item.tweet.text,
      sources: [{ handle: item.handle }],
      cluster_score: Math.min(item.score / 1000, 1),
    }));

    res.json({
      date: new Date().toISOString().split('T')[0],
      stories,
      totalAvailable: timeline.data.length,
    });
  } catch (err) {
    console.error('[PersonalStories] Error:', err);
    res.json({
      fallback: true,
      reason: 'Internal error fetching personal stories',
      stories: [],
      date: new Date().toISOString().split('T')[0],
    });
  }
}

/**
 * Generates the HTML callback page shown after Twitter redirects back.
 */
function callbackPage(success: boolean, errorMsg: string, code?: string, state?: string, handle?: string): string {
  if (!success) {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #0a0a14; color: #d0cfe0; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { text-align: center; padding: 40px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    .msg { color: #f87171; margin-top: 12px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10060;</div>
    <h2>Connection Failed</h2>
    <div class="msg">${errorMsg}</div>
    <p style="margin-top: 20px; color: #666; font-size: 12px;">You can close this tab.</p>
  </div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #0a0a14; color: #d0cfe0; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { text-align: center; padding: 40px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    .msg { color: #4ade80; margin-top: 12px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#9889;</div>
    <h2>${handle ? 'Connected!' : 'Connecting to Twitter...'}</h2>
    <div class="msg">${handle ? `@${handle} linked to NewsFlash` : 'Please wait while NewsFlash completes the connection.'}</div>
    <p style="margin-top: 20px; color: #666; font-size: 12px;">You can close this tab and return to NewsFlash.</p>
  </div>
</body>
</html>`;
}
